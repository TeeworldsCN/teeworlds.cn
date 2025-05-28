import { error } from '@sveltejs/kit';
import { sqlite } from '$lib/server/sqlite';
import type { RequestHandler } from './$types';
import type { TicketAttachment } from '$lib/server/db/tickets';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const attachmentUuid = params.id;

		if (!attachmentUuid) {
			return error(400, 'Invalid attachment UUID');
		}

		// Get attachment record with file data
		const attachment = sqlite
			.query<Omit<TicketAttachment, 'file_data'> & { file_data: Uint8Array }, string>(
				`SELECT uuid, ticket_uuid, filename, original_filename, file_size, mime_type, file_data, uploaded_by, uploaded_at
				 FROM ticket_attachments WHERE uuid = ?`
			)
			.get(attachmentUuid);

		if (!attachment) {
			return error(404, 'Attachment not found');
		}

		// Convert file data to buffer
		const fileBuffer = Buffer.from(attachment.file_data);

		// Properly encode filename for Content-Disposition header
		const encodedFilename = encodeURIComponent(attachment.original_filename);
		const contentDisposition = `attachment; filename*=UTF-8''${encodedFilename}`;

		// Return file with appropriate headers
		return new Response(fileBuffer, {
			headers: {
				'Content-Type': attachment.mime_type,
				'Content-Length': attachment.file_size.toString(),
				'Content-Disposition': contentDisposition,
				'Cache-Control': 'private, max-age=3600'
			}
		});

	} catch (err) {
		console.error('File download error:', err);
		return error(500, 'File download failed');
	}
};
