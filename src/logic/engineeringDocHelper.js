import JSZip from 'jszip';
import defaultSeedDoc from '../data/engineeringGovernanceDoc.json' with { type: 'json' };

export const ENGINEERING_DOC_STORAGE_KEY = 'pvc_engineering_governance_doc';

/**
 * Escapes text for XML attribute/element safety
 * @param {string} unsafe
 * @returns {string}
 */
export function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Loads the current engineering governance document from localStorage or fallback seed
 * @returns {Object}
 */
export function loadEngineeringDoc() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(ENGINEERING_DOC_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.title && Array.isArray(parsed.sections)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to parse stored engineering governance doc:', err);
    }
  }
  return JSON.parse(JSON.stringify(defaultSeedDoc));
}

/**
 * Persists the engineering governance document to localStorage
 * @param {Object} doc
 * @returns {boolean}
 */
export function saveEngineeringDoc(doc) {
  if (!doc || !doc.title || !Array.isArray(doc.sections)) {
    throw new Error('Invalid document structure');
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ENGINEERING_DOC_STORAGE_KEY, JSON.stringify(doc));
      return true;
    } catch (err) {
      console.error('Failed to save engineering governance doc:', err);
      throw err;
    }
  }
  return false;
}

/**
 * Resets the engineering governance document to the default seed payload
 * @returns {Object}
 */
export function resetEngineeringDoc() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(ENGINEERING_DOC_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear stored engineering doc:', err);
    }
  }
  return JSON.parse(JSON.stringify(defaultSeedDoc));
}

/**
 * Generates an OpenXML (.docx) Blob from the document structure using JSZip
 * @param {Object} doc
 * @returns {Promise<Blob>}
 */
export async function generateDocxBlob(doc) {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>'
  );

  // 2. _rels/.rels
  zip.folder('_rels').file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'
  );

  // 3. word/document.xml
  let bodyXml = '';

  // Document Title
  const titleText = escapeXml(doc.title || 'Engineering Documentation');
  bodyXml += '<w:p>' +
    '<w:pPr>' +
      '<w:jc w:val="center"/>' +
      '<w:bidi/>' +
      '<w:spacing w:before="120" w:after="120"/>' +
    '</w:pPr>' +
    '<w:r>' +
      '<w:rPr>' +
        '<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Arial"/>' +
        '<w:b/>' +
        '<w:sz w:val="38"/>' +
        '<w:szCs w:val="38"/>' +
        '<w:color w:val="0F172A"/>' +
        '<w:rtl/>' +
      '</w:rPr>' +
      '<w:t>' + titleText + '</w:t>' +
    '</w:r>' +
  '</w:p>';

  // Document Subtitle
  if (doc.subtitle) {
    const subtitleText = escapeXml(doc.subtitle);
    bodyXml += '<w:p>' +
      '<w:pPr>' +
        '<w:jc w:val="center"/>' +
        '<w:spacing w:after="280"/>' +
      '</w:pPr>' +
      '<w:r>' +
        '<w:rPr>' +
          '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/>' +
          '<w:i/>' +
          '<w:sz w:val="22"/>' +
          '<w:szCs w:val="22"/>' +
          '<w:color w:val="0D9488"/>' +
        '</w:rPr>' +
        '<w:t>' + subtitleText + '</w:t>' +
      '</w:r>' +
    '</w:p>';
  }

  // Divider line
  bodyXml += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="8" w:color="0D9488"/></w:pBdr><w:spacing w:after="240"/></w:pPr></w:p>';

  // Document Sections
  if (Array.isArray(doc.sections)) {
    doc.sections.forEach((section, sIdx) => {
      // Section Heading (Level 1)
      const headingText = escapeXml(section.heading || `Section ${sIdx + 1}`);
      bodyXml += '<w:p>' +
        '<w:pPr>' +
          '<w:jc w:val="right"/>' +
          '<w:bidi/>' +
          '<w:spacing w:before="280" w:after="140"/>' +
          '<w:pBdr>' +
            '<w:bottom w:val="single" w:sz="4" w:space="4" w:color="CBD5E1"/>' +
          '</w:pBdr>' +
        '</w:pPr>' +
        '<w:r>' +
          '<w:rPr>' +
            '<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Arial"/>' +
            '<w:b/>' +
            '<w:sz w:val="28"/>' +
            '<w:szCs w:val="28"/>' +
            '<w:color w:val="0F766E"/>' +
            '<w:rtl/>' +
          '</w:rPr>' +
          '<w:t>' + headingText + '</w:t>' +
        '</w:r>' +
      '</w:p>';

      // Items list
      if (Array.isArray(section.items)) {
        section.items.forEach((item) => {
          const itemText = escapeXml(item);
          bodyXml += '<w:p>' +
            '<w:pPr>' +
              '<w:jc w:val="right"/>' +
              '<w:bidi/>' +
              '<w:ind w:right="240"/>' +
              '<w:spacing w:after="120" w:line="320" w:lineRule="auto"/>' +
            '</w:pPr>' +
            '<w:r>' +
              '<w:rPr>' +
                '<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Arial"/>' +
                '<w:sz w:val="22"/>' +
                '<w:szCs w:val="22"/>' +
                '<w:color w:val="1E293B"/>' +
                '<w:rtl/>' +
              '</w:rPr>' +
              '<w:t>' + itemText + '</w:t>' +
            '</w:r>' +
          '</w:p>';
        });
      }
    });
  }

  // Section / Page configuration (A4 paper, RTL layout)
  bodyXml += '<w:sectPr>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>' +
    '<w:bidi/>' +
  '</w:sectPr>';

  const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + bodyXml + '</w:body>' +
    '</w:document>';

  zip.folder('word').file('document.xml', docXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

/**
 * Triggers a browser download of the document as a .docx Word file
 * @param {Object} doc
 * @param {string} [filename]
 */
export async function downloadDocumentAsWord(doc, filename) {
  const blob = await generateDocxBlob(doc);
  const resolvedName = filename || `Engineering_Governance_Documentation_${new Date().toISOString().slice(0, 10)}.docx`;
  
  if (typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resolvedName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 200);
  }
}
