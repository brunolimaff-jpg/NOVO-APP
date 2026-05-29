// Public facade preserved for components/WarRoom.tsx and tests.
// Internal decomposition lives under services/war-room/.

export type { WarRoomMessage, WarRoomMode, WarRoomQueryOptions, WarRoomResult } from './war-room/contracts';
export { queryWarRoom } from './war-room/query';
