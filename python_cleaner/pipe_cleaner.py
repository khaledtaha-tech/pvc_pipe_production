#!/usr/bin/env python3
"""
Pipe Production Data Cleaner & Analytics Engine (Python Version)
Cleans Daily Production Log Excel files, checks formulas, calculates Scrap % & Downtime,
and outputs clean Excel and Summary sheets.
"""

import os
import sys
import pandas as pd
import numpy as np

def clean_pipe_data(file_path, sheet_name="Daily Production Log"):
    print(f"Reading: {file_path}, Sheet: {sheet_name}...")
    
    # Read Excel or CSV
    if file_path.endswith(('.xlsx', '.xls')):
        df = pd.read_excel(file_path, sheet_name=sheet_name)
    else:
        df = pd.read_csv(file_path)
        
    print(f"Loaded {len(df)} rows.")

    # 1. Column standardization
    col_mapping = {
        'Date': 'date',
        'Item Code': 'item_code',
        'Product Description & Specs': 'product_specs',
        'Machine': 'machine',
        'Production Qty (FG)': 'qty_fg',
        'Unit Weight (kg)': 'unit_weight_kg',
        'Total Weight (kg)': 'total_weight_kg',
        'Scrap / Rejection (kg)': 'scrap_kg',
        'Operating Hours': 'operating_hours',
        'Reason of Stop': 'reason_of_stop'
    }
    
    # Fuzzy match existing columns
    renamed = {}
    for col in df.columns:
        for standard_name, key in col_mapping.items():
            if standard_name.lower() in str(col).lower():
                renamed[col] = standard_name
                break
    df = df.rename(columns=renamed)

    # 2. Clean Dates
    if 'Date' in df.columns:
        df['Date'] = pd.to_datetime(df['Date'], errors='coerce').dt.strftime('%Y-%m-%d')

    # 2.1 Extract Diameter & Thickness from Product Description & Specs
    def extract_dimensions(desc):
        if not isinstance(desc, str):
            return pd.Series(['-', '-'], index=['Diameter', 'Thickness'])
        text = desc.strip()
        diameter = ''
        thickness = ''
        import re
        imp_match = re.search(r'(?:^|[\s_])((\d+(?:\s+\d+\/\d+|\/\d+)?|\d+(?:\.\d+)?)\s*(?:"|\'\'|inch|in\b))', text, re.I)
        sdr_sch_match = re.search(r'\b(SDR\s*\d+(?:\.\d+)?|SCH(?:EDULE)?\s*\d+)\b', text, re.I)
        if imp_match:
            raw_diam = re.sub(r"\'\'", '"', imp_match.group(1)).strip()
            raw_diam = re.sub(r'\s*inch|\s*in\b', '"', raw_diam, flags=re.I).strip()
            diameter = raw_diam if raw_diam.endswith('"') else f'{raw_diam}"'
        if sdr_sch_match:
            thickness = re.sub(r'\s+', ' ', sdr_sch_match.group(1).upper())
            thickness = re.sub(r'SCH(\d+)', r'SCH \1', thickness)

        cross_match = re.search(r'\b(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\b', text)
        two_mm_match = re.search(r'\b(\d+(?:\.\d+)?)\s*MM\b[^\d]*?(\d+(?:\.\d+)?)\s*MM\b', text, re.I)
        mm_x_match = re.search(r'\b(\d+(?:\.\d+)?)\s*MM\b.*?[xX*×]\s*(\d+(?:\.\d+)?)(?:\s*MM)?\b', text, re.I)

        if not diameter:
            if two_mm_match:
                diameter = f"{two_mm_match.group(1)} mm"
                if not thickness:
                    thickness = f"{two_mm_match.group(2)} mm"
            elif mm_x_match:
                diameter = f"{mm_x_match.group(1)} mm"
                if not thickness:
                    thickness = f"{mm_x_match.group(2)} mm"
            elif cross_match:
                diameter = f"{cross_match.group(1)} mm"
                if not thickness:
                    thickness = f"{cross_match.group(2)} mm"
            else:
                single_mm = re.search(r'\b(\d+(?:\.\d+)?)\s*MM\b', text, re.I)
                if single_mm:
                    diameter = f"{single_mm.group(1)} mm"

        if not thickness:
            if cross_match:
                thickness = f"{cross_match.group(2)} mm"
            else:
                wall_mm = re.search(r'\b(\d+\.\d+)\s*(?:MM)?\b', text, re.I)
                if wall_mm and wall_mm.group(1) not in diameter:
                    thickness = f"{wall_mm.group(1)} mm"

        return pd.Series([diameter or '-', thickness or '-'], index=['Diameter', 'Thickness'])

    if 'Product Description & Specs' in df.columns:
        dims_df = df['Product Description & Specs'].apply(extract_dimensions)
        desc_idx = df.columns.get_loc('Product Description & Specs')
        df.insert(desc_idx + 1, 'Diameter', dims_df['Diameter'])
        df.insert(desc_idx + 2, 'Thickness', dims_df['Thickness'])

    # 3. Numeric conversion
    num_cols = ['Production Qty (FG)', 'Unit Weight (kg)', 'Total Weight (kg)', 'Scrap / Rejection (kg)', 'Operating Hours']
    for col in num_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', ''), errors='coerce').fillna(0)

    # 4. Mathematical formula audit
    df['Expected_Total_Weight_kg'] = (df['Production Qty (FG)'] * df['Unit Weight (kg)']).round(2)
    
    # Auto-fill or adjust if Total Weight is missing or 0
    mask_missing_weight = (df['Total Weight (kg)'] == 0) & (df['Expected_Total_Weight_kg'] > 0)
    df.loc[mask_missing_weight, 'Total Weight (kg)'] = df.loc[mask_missing_weight, 'Expected_Total_Weight_kg']

    # Check for discrepancy
    df['Weight_Diff_kg'] = (df['Total Weight (kg)'] - df['Expected_Total_Weight_kg']).abs().round(2)
    df['Weight_Audit_Flag'] = np.where(df['Weight_Diff_kg'] > 5.0, 'Discrepancy', 'OK')

    # 5. Scrap metrics
    total_raw = df['Total Weight (kg)'] + df['Scrap / Rejection (kg)']
    df['Scrap_Percentage'] = np.where(total_raw > 0, (df['Scrap / Rejection (kg)'] / total_raw) * 100, 0).round(2)

    # 6. Operating Hours & Downtime (24h schedule)
    df['Operating Hours'] = df['Operating Hours'].clip(lower=0, upper=24)
    df['Downtime_Hours'] = (24 - df['Operating Hours']).round(1)

    # 7. Productivity Rate (kg/hr)
    df['Throughput_kg_hr'] = np.where(df['Operating Hours'] > 0, (df['Total Weight (kg)'] / df['Operating Hours']).round(1), 0)

    print("\n--- Cleaning & Audit Summary ---")
    print(f"Total Rows: {len(df)}")
    print(f"Total Production: {(df['Total Weight (kg)'].sum() / 1000):.2f} Tons ({df['Production Qty (FG)'].sum():,.0f} Pipes)")
    print(f"Total Scrap: {df['Scrap / Rejection (kg)'].sum():,.1f} kg ({df['Scrap_Percentage'].mean():.2f}% average)")
    print(f"Total Operating Hours: {df['Operating Hours'].sum()} hrs (Downtime: {df['Downtime_Hours'].sum()} hrs)")

    # Save Cleaned File
    output_file = "Cleaned_" + os.path.basename(file_path) if file_path.endswith(('.xlsx', '.xls')) else "Cleaned_Production.xlsx"
    
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Cleaned Production Log', index=False)
        
        # Machine Summary
        machine_summary = df.groupby('Machine').agg(
            Total_Tons=('Total Weight (kg)', lambda x: round(x.sum() / 1000, 2)),
            Total_Pcs=('Production Qty (FG)', 'sum'),
            Total_Scrap_kg=('Scrap / Rejection (kg)', 'sum'),
            Avg_Scrap_Pct=('Scrap_Percentage', 'mean'),
            Total_Run_Hours=('Operating Hours', 'sum'),
            Avg_kg_hr=('Throughput_kg_hr', 'mean')
        ).reset_index()
        machine_summary.to_excel(writer, sheet_name='Machine Performance', index=False)

    print(f"\nSaved Cleaned File to: {output_file}")
    return df

if __name__ == '__main__':
    if len(sys.argv) > 1:
        clean_pipe_data(sys.argv[1])
    else:
        print("Usage: python pipe_cleaner.py <path_to_excel_file.xlsx>")
