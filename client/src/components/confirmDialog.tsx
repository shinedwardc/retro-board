interface ConfirmDialogProps {
	isOpen?: boolean;
	title?: string;
	message: string;
	onConfirm: () => void;
	onCancel: () => void;
}

const ConfirmDialog = ({ message, onConfirm, onCancel }: ConfirmDialogProps) => (
	<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div className="w-full max-w-sm rounded-lg bg-surface-2 p-6 shadow-xl">
			<p className="mb-4 font-medium text-ink">{message}</p>
			<div className="flex justify-end gap-3">
				<button
					type="button"
					onClick={onCancel}
					className="rounded bg-surface-1 px-4 py-2 text-ink text-sm hover:bg-rail"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={onConfirm}
					className="rounded bg-line-improve px-4 py-2 text-sm text-white hover:brightness-90"
				>
					Confirm
				</button>
			</div>
		</div>
	</div>
);

export default ConfirmDialog;
