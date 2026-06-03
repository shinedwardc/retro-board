export type NoteCategory = "positive" | "negative" | "action";

export interface Note {
	id: string;
	room_id: string;
	content: string;
	category: NoteCategory;
	author: string;
	votes: string[];
	rank: string;
	created_at?: string;
}

export interface ServerToClientEvents {
	"room:created": (data: { token: string }) => void;
	"room:state": (data: { notes: Note[]; users: string[]; isCreator: boolean }) => void;
	"room:error": (data: { message: string }) => void;
	"user:joined": (data: { userName: string }) => void;
	"user:left": (data: { userName: string }) => void;
	"note:created": (note: Note) => void;
	"note:updated": (data: { noteId: string; updatedContent: string }) => void;
	"note:voted": (data: { noteId: string; votes: string[]; incrementingVote: boolean }) => void;
	"note:deleted": (data: { noteId: string }) => void;
	"note:moved": (data: { noteId: string; rank: string }) => void;
	"board:cleared": () => void;
}

export interface ClientToServerEvents {
	"room:create": (data: { roomCode: string; userName: string }) => void;
	"room:join": (data: { roomCode: string; userName: string; token?: string }) => void;
	"note:create": (data: { roomCode: string; note: Omit<Note, "room_id" | "created_at"> }) => void;
	"note:update": (data: { roomCode: string; noteId: string; updatedContent: string }) => void;
	"note:vote": (data: { roomCode: string; noteId: string }) => void;
	"note:delete": (data: { roomCode: string; noteId: string }) => void;
	"note:move": (data: { roomCode: string; noteId: string; rank: string }) => void;
	"board:clear": (data: { roomCode: string }) => void;
}

export interface SocketData {
	username?: string;
	roomCode?: string;
	roomDbId?: string;
	isCreator?: boolean;
}
