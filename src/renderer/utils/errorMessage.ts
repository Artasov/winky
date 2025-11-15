export const getErrorMessage = (error: any, fallback: string): string => {
    if (typeof error?.response?.data?.detail === 'string') {
        return error.response.data.detail;
    }

    const source = typeof error?.message === 'string' ? error.message : null;
    if (source) {
        const remoteMatch = source.match(/Error invoking remote method '.*?':\s*(.*)/);
        if (remoteMatch?.[1]) {
            return remoteMatch[1];
        }
        const axiosMatch = source.match(/AxiosError:\s*(.*)/);
        if (axiosMatch?.[1]) {
            return axiosMatch[1];
        }
        return source.replace(/^Error:\s*/, '');
    }

    return fallback;
};
