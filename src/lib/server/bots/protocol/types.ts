export type SendReply = {
	text: (msg: string) => void;
	link: (title: string, desc: string, url: string) => void;
	thumbnails: (title: string, desc: string, url: string, image: string) => void;
};

export type Handler = (
	uid: string,
	reply: SendReply,
	command: string,
	args: string,
	mode: 'GROUP' | 'DIRECT'
) => Promise<void> | void;
