// QQ Rich Text types for client-side use
export interface QQRichText {
	paragraphs: QQRichTextParagraph[];
}

export enum QQRichTextAlignment {
	Left = 0,
	Center = 1,
	Right = 2
}

export enum QQRichTextType {
	Text = 1,
	Image = 2,
	Video = 3,
	Url = 4
}

export type QQRichTextElem =
	| QQRichTextElemText
	| QQRichTextElemImage
	| QQRichTextElemVideo
	| QQRichTextElemUrl;

export type QQRichTextElemText = {
	text: {
		text: string;
		props?: {
			font_bold?: boolean;
			italic?: boolean;
			underline?: boolean;
		};
	};
	type: QQRichTextType.Text;
};

export type QQRichTextElemImage = {
	image: {
		third_url: string;
		width_percent: number;
	};
	type: QQRichTextType.Image;
};

export type QQRichTextElemVideo = {
	video: {
		third_url: string;
	};
	type: QQRichTextType.Video;
};

export type QQRichTextElemUrl = {
	url: {
		url: string;
		desc: string;
	};
	type: QQRichTextType.Url;
};

export interface QQRichTextParagraph {
	elems: QQRichTextElem[];
	props?: {
		alignment?: QQRichTextAlignment;
	};
}

export interface QQChannel {
	id: string;
	guild_id: string;
	name: string;
	type: number;
	position: number;
	parent_id: string;
	owner_id: string;
	sub_type: number;
}

export interface QQGuild {
	id: string;
	name: string;
	icon: string;
	owner_id: string;
	owner: boolean;
	joined_at: string;
	member_count: number;
	max_members: number;
	description: string;
}
