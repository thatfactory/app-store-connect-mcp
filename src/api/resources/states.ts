// Independent enums from the pinned Apple 4.4.1 schema. Unknown states fail closed.
export const knownAppInfoStates = ['ACCEPTED','DEVELOPER_REJECTED','IN_REVIEW','PENDING_RELEASE','PREPARE_FOR_SUBMISSION','READY_FOR_DISTRIBUTION','READY_FOR_REVIEW','REJECTED','REPLACED_WITH_NEW_INFO','WAITING_FOR_REVIEW'] as const;
export const editableAppInfoStates = new Set<string>(['PREPARE_FOR_SUBMISSION','DEVELOPER_REJECTED','REJECTED']);
export const editableVersionStates = new Set<string>(['PREPARE_FOR_SUBMISSION','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED']);
