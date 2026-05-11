interface ConfirmDialogProps {
	isOpen?: boolean;
	title?: string;
	message: string;
	onConfirm: () => void;
	onCancel: () => void;
}

const ConfirmDialog = ({
	message,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) => (
	<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
			<p className="text-gray-800 font-medium mb-4">{message}</p>
			<div className="flex justify-end gap-3">
				<button
					type="button"
					onClick={onCancel}
					className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={onConfirm}
					className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
				>
					Confirm
				</button>
			</div>
		</div>
	</div>
);

export default ConfirmDialog;
