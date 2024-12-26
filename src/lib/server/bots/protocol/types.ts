// result of sending message
export type SendResult = object;

export type SendReply = {
	text: (msg: string) => Promise<SendResult> | SendResult;
	custom: (body: any) => Promise<SendResult> | SendResult;
};

export type Handler = (
	uid: string,
	reply: SendReply,
	command: string,
	args: string,
	mode: 'GROUP' | 'DIRECT'
) => Promise<SendResult> | SendResult;
