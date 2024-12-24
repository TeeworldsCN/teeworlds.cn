export const secondsToDate = (totalSeconds: number) => {
	return new Date(totalSeconds * 1000).toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
};

export const millisecondsToDate = (totalMilliseconds: number) => {
	return new Date(totalMilliseconds).toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
};
