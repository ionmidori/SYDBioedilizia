import { ROOM_TYPES, fileRoomUpdateSchema, roomCreateSchema, roomSchema, roomUpdateSchema } from '../room';

// What GET /api/projects/{id}/rooms returns for the default room (RoomSchema.model_dump(mode="json")).
const ROOM = {
    room_id: 'generale',
    label: 'Generale',
    room_type: 'altro',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    brief: {
        floor_mq: null,
        walls_mq: null,
        height_m: null,
        surfaces: null,
        systems: null,
        fixtures: null,
        criticalities: [],
        decisions: [],
        open_questions: [],
    },
    reference_photo_id: null,
    summary: null,
};

describe('room schemas (Golden Sync with schemas/room.py)', () => {
    it('accepts a room as the backend returns it', () => {
        expect(roomSchema.parse(ROOM)).toEqual(ROOM);
    });

    it('keeps the room types of the backend, in order', () => {
        expect(ROOM_TYPES).toEqual(['cucina', 'soggiorno', 'camera', 'bagno', 'corridoio', 'altro']);
    });

    it.each([
        ['an unknown room type', { room_type: 'garage' }],
        ['a blank label', { label: '   ' }],
        ['a room id with a slash', { room_id: 'a/b' }],
        ['an unknown field', { extra: 1 }],
        ['a negative floor area', { brief: { ...ROOM.brief, floor_mq: -1 } }],
    ])('rejects %s', (_label, patch) => {
        expect(roomSchema.safeParse({ ...ROOM, ...patch }).success).toBe(false);
    });

    it('trims the label of a new room', () => {
        expect(roomCreateSchema.parse({ label: ' Bagno ', room_type: 'bagno' }).label).toBe('Bagno');
    });

    it('needs a change to update a room', () => {
        expect(roomUpdateSchema.safeParse({}).success).toBe(false);
        expect(roomUpdateSchema.safeParse({ room_type: 'cucina' }).success).toBe(true);
    });

    it('moves a file only to a valid room id', () => {
        expect(fileRoomUpdateSchema.safeParse({ room_id: 'r1' }).success).toBe(true);
        expect(fileRoomUpdateSchema.safeParse({ room_id: '' }).success).toBe(false);
    });
});
