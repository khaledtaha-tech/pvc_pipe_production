// Official Factory Machine Master & Profiles Directory
import {
  MACHINES,
  MASTER_MACHINE_PROFILES,
  CANONICAL_PIPE_EXTRUDERS,
  matchMachine,
  normalizeLineId,
  normalizeMachineKey,
  machineLabel,
  findMasterMachineProfile,
  canonicalizeMachineName,
  isUnknownMachine,
  isMachineEligibleForDiameter,
  PLANT_NAME,
  SOP_REF,
  DOC_VERSION,
  DOC_STATUS
} from '../config/machines.js';

export {
  MACHINES,
  MASTER_MACHINE_PROFILES,
  CANONICAL_PIPE_EXTRUDERS,
  matchMachine,
  normalizeLineId,
  normalizeMachineKey,
  machineLabel,
  findMasterMachineProfile,
  canonicalizeMachineName,
  isUnknownMachine,
  isMachineEligibleForDiameter,
  PLANT_NAME,
  SOP_REF,
  DOC_VERSION,
  DOC_STATUS
};

export default MACHINES;
