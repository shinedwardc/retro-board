import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const NoteCard = ({ note, voteNote, updateNote, deleteNote, userName }) => {

    const [editedContent, setEditedContent] = useState(note.content);
    const [isEditing, setIsEditingState] = useState(false);

    const { attributes, listeners, setNodeRef: setDraggableNodeRef, transform, transition, isDragging } = useSortable({
        id: note.id,
        disabled: isEditing
    });

    const style = transform ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : undefined,
    } : undefined;

    return (
        <div ref={setDraggableNodeRef} 
            style={style}
            {...attributes}
            {...listeners} 
            className="bg-yellow-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
            {isEditing ? (
                <textarea
                    value={editedContent}
                    onChange={e => setEditedContent(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            updateNote(note.id, editedContent);
                        }
                    }}
                    className="text-sm text-gray-800 flex-1 bg-transparent border-b border-gray-400 focus:outline-none"
                />
            ) : (
                <p className="text-sm text-gray-800 wrap-break-word">{note.content}</p>
            )}
            <p className="text-xs text-gray-500">— {note.author}</p>
            <div className="flex items-center justify-between mt-1">
                <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => voteNote(note.id)}
                    className={`text-xs ${note.votes.includes(userName) ? 'bg-green-400' : 'bg-white'} rounded-full px-2 py-1 hover:bg-green-600`}
                >
                    👍 {note.votes.length}
                </button>
                {note.author === userName && (
                    !isEditing ? (
                        <div className="flex flex-row items-center gap-x-2">
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => {
                                    setIsEditingState(true);
                                }}
                                className="text-xs text-white bg-blue-400 hover:bg-blue-600 rounded-full px-2 py-1"
                            >
                                Edit
                            </button>
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => deleteNote(note.id)}
                                className="text-xs text-white bg-red-400 hover:bg-red-600 rounded-full px-2 py-1"
                            >
                                Delete
                            </button>
                        </div>                        
                    ) : (
                        <div className="flex flex-row items-center gap-x-2">
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => {
                                    updateNote(note.id, editedContent);
                                    setIsEditingState(false);
                                }}
                                className="text-xs text-white bg-green-400 hover:bg-green-600 rounded-full px-2 py-1"
                            >
                                Save
                            </button>
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => {
                                    setEditedContent(note.content);
                                    setIsEditingState(false);
                                }}
                                className="text-xs text-white bg-gray-400 hover:bg-gray-600 rounded-full px-2 py-1"
                            >
                                Cancel
                            </button>
                        </div>                        
                    )
                )}
            </div>
        </div>        
    )
}

export default NoteCard;