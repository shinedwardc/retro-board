// Rooms stored in memory for now - each room represents a board with its own live state 
const rooms = new Map()
/*
rooms = {
    roomId,
    users : [],
    notes: [
        {
            id,
            category,
            content,
            author,
            votes: [...usernames] // list of users who voted for this note
        }
    ]
} 
*/

export function registerSocketHandlers(io, socket) {
    socket.on('room:join', ({ roomId, userName }) => {
        socket.join(roomId);
        socket.data.username = userName;
        socket.data.roomId = roomId;
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { notes: [], users: [] });
        }

        const room = rooms.get(roomId)
        if (room.users.includes(userName)) {
            socket.emit('room:error', { message: `"${userName}" is already taken in this room.` })
            return
        }

        room.users.push(userName);
        if (room.users.length > 1) {
            socket.to(roomId).emit('user:joined', { userName })
        }
        socket.emit('room:state', room);       
    });

    // Handle note creation request from client
    socket.on('note:create', ({ roomId, note }) => {
        const room = rooms.get(roomId)
        if (!room) return

        room.notes.push(note)

        // Broadcast the new note to all users in the room, including the sender
        io.to(roomId).emit('note:created', note)
        console.log(`Note created in room ${roomId} by ${socket.data.username}`)
    });

    // Handle note update request from client
    socket.on('note:update', ({ roomId, noteId, updatedContent }) => {
        const room = rooms.get(roomId)
        if (!room) return

        // Find the note to update in the room's notes array
        const noteIndex = room.notes.findIndex(n => n.id === noteId)
        if (noteIndex === -1) return

        // Update the note's existing content with new content
        room.notes[noteIndex].content = updatedContent;

        // Broadcast the updated note to all users in the room, including the sender
        io.to(roomId).emit('note:updated', { noteId, updatedContent })
        console.log(`Note updated in room ${roomId} by ${socket.data.username}`)
    });

    socket.on('note:vote', ({ roomId, noteId }) => {
        const room = rooms.get(roomId)
        if (!room) return

        const note = room.notes.find(n => n.id === noteId)
        if (!note) return

        const incrementingVote = !note.votes.includes(socket.data.username);
        if (incrementingVote) {
            // User is voting for the note, and the user hasn't voted for it yet, so add the user's vote
            note.votes.push(socket.data.username)
        }
        else {
            // User has already voted, remove the vote from the user
            note.votes = note.votes.filter(voter => voter !== socket.data.username)
        }
        
        // Broadcast the updated vote count to all users in the room, including the sender
        io.to(roomId).emit('note:voted', {noteId, votes: note.votes, incrementingVote})
        console.log(`Note voted in room ${roomId} by ${socket.data.username}`)
    })

    socket.on('note:update', ({ roomId, noteId, updatedContent }) => {
        const room = rooms.get(roomId)
        if (!room) return

        const note = room.notes.find(n => n.id === noteId)
        if (!note) return

        note.content = updatedContent;

        // Broadcast the updated note to all users in the room, including the sender
        io.to(roomId).emit('note:updated', { noteId, updatedContent })
        console.log(`Note updated in room ${roomId} by ${socket.data.username}`)
    })

    socket.on('note:delete', ({ roomId, noteId }) => {
        const room = rooms.get(roomId)
        if (!room) return

        room.notes = room.notes.filter(n => n.id !== noteId)

        // Broadcast the note deletion to all users in the room, including the sender
        io.to(roomId).emit('note:deleted', { noteId })
        console.log(`Note deleted in room ${roomId} by ${socket.data.username}`)
    })

    socket.on('note:move', ({ roomId, noteIds }) => {
        const room = rooms.get(roomId)
        if (!room) return

        // Reorder the notes based on the provided noteIds
        room.notes = noteIds.map(id => room.notes.find(n => n.id === id)).filter(Boolean);

        // Broadcast the updated note order to all users in the room, including the sender
        io.to(roomId).emit('note:moved', room.notes)
        console.log(`Note moved in room ${roomId} by ${socket.data.username}`)
    })

    socket.on('disconnect', () => {
        const { username, roomId } = socket.data
        if (!username || !roomId) return

        const room = rooms.get(roomId)
        if (!room) return

        room.users = room.users.filter(u => u !== username)
        socket.to(roomId).emit('user:left', { userName: username })
        console.log(`${username} left room ${roomId}`)
    })
}