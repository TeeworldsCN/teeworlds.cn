import {
	addTicketAttachment,
	getTicket,
	canUploadAttachment,
	isUserBanned,
	TICKET_EXPIRE_TIME
} from '$lib/server/db/tickets';
import { hasPermission } from '$lib/server/db/users';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTicketUserInfo } from '$lib/server/auth/ticket-auth';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'application/pdf',
	'text/plain',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/zip',
	'application/x-zip-compressed',
	'application/octet-stream', // For .demo files and other binary files
	'text/x-log' // For .log files
];

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const ticketUuid = formData.get('ticket_uuid') as string;
		const as = formData.get('as') as string;

		if (!file) {
			return json({ success: false, error: 'No file provided' }, { status: 400 });
		}

		if (!ticketUuid) {
			return json({ success: false, error: 'Ticket UUID is required' }, { status: 400 });
		}

		if (!as || (as !== 'admin' && as !== 'visitor')) {
			return json(
				{
					success: false,
					error: 'Invalid or missing "as" parameter. Must be "admin" or "visitor"'
				},
				{ status: 400 }
			);
		}

		// Verify ticket exists
		const ticket = getTicket(ticketUuid);
		if (!ticket) {
			return json({ success: false, error: 'Ticket not found' }, { status: 404 });
		}

		// Can't upload to expired tickets
		if (ticket.status === 'closed' && Date.now() - ticket.updated_at > TICKET_EXPIRE_TIME) {
			return json({ success: false, error: '工单已过期' }, { status: 401 });
		}

		// Determine authentication and author info based on 'as' parameter
		let isAdmin: boolean;
		let uploadedBy: string;

		if (as === 'admin') {
			// Use admin authentication (locals.user)
			isAdmin = hasPermission(locals.user, 'TICKETS');
			if (!isAdmin) {
				return json({ success: false, error: 'Forbidden' }, { status: 403 });
			}
			uploadedBy = locals.user?.username || '管理';
		} else {
			// Use visitor authentication (cookie JWT)
			isAdmin = false;

			if (ticket.status === 'closed') {
				return json(
					{
						success: false,
						error: `已关闭的工单无法再上传附件`
					},
					{ status: 400 }
				);
			}

			// Check authentication via ticket JWT token
			const userInfo = getTicketUserInfo(cookies);
			if (!userInfo || ticket.author_uid !== userInfo.uid) {
				return json({ success: false, error: 'Forbidden' }, { status: 403 });
			}

			// Check if user is banned from uploading files
			if (isUserBanned(userInfo.uid)) {
				return json(
					{
						success: false,
						error: '你当前无法上传附件',
						errorType: 'user_banned'
					},
					{ status: 403 }
				);
			}

			uploadedBy = userInfo.playerName || '访客';
		}

		// Check attachment limits
		const { canUpload, currentCount, limit } = canUploadAttachment(ticketUuid, isAdmin);
		if (!canUpload) {
			return json(
				{
					success: false,
					error: `已达到附件上传限制 (${currentCount}/${limit})\n如有需要可以告知管理帮你解除限制`,
					errorType: 'attachment_limit_reached',
					currentCount,
					limit
				},
				{ status: 400 }
			);
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE) {
			return json(
				{
					success: false,
					error: `文件大小超过 10MB 限制`,
					errorType: 'file_too_large',
					fileSize: file.size,
					maxSize: MAX_FILE_SIZE
				},
				{ status: 400 }
			);
		}

		// Validate file type
		if (!ALLOWED_TYPES.includes(file.type)) {
			return json(
				{
					success: false,
					error: '不支持的文件类型',
					errorType: 'invalid_file_type',
					fileType: file.type
				},
				{ status: 400 }
			);
		}

		// Generate unique filename for reference
		const timestamp = Date.now();
		const randomSuffix = Math.random().toString(36).substring(2, 8);
		const fileExtension = file.name.split('.').pop() || '';
		const filename = `${timestamp}_${randomSuffix}${fileExtension ? '.' + fileExtension : ''}`;

		// Get file data
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Save attachment record with file data
		const attachment = addTicketAttachment({
			ticket_uuid: ticketUuid,
			filename,
			original_filename: file.name,
			file_size: file.size,
			mime_type: file.type,
			file_data: buffer,
			uploaded_by: uploadedBy,
			uploaded_at: timestamp
		});

		if (!attachment) {
			return json(
				{
					success: false,
					error: '保存附件记录失败',
					errorType: 'save_failed'
				},
				{ status: 500 }
			);
		}

		return json({
			success: true,
			attachment: {
				uuid: attachment.uuid,
				filename: attachment.filename,
				original_filename: attachment.original_filename,
				file_size: attachment.file_size,
				mime_type: attachment.mime_type,
				uploaded_by: attachment.uploaded_by,
				uploaded_at: attachment.uploaded_at
			}
		});
	} catch (err) {
		console.error('File upload error:', err);
		return json(
			{
				success: false,
				error: '文件上传失败',
				errorType: 'upload_failed'
			},
			{ status: 500 }
		);
	}
};
