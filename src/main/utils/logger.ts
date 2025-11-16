import {emitToAllWindows} from '../windows/emitToAllWindows';

export const sendLogToRenderer = (type: string, data: any): void => {
    if (process.env.NODE_ENV !== 'development') {
        return;
    }
    emitToAllWindows('api-log', {type, data});
};
