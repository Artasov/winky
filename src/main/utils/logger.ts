import {emitToAllWindows} from '../windows/emitToAllWindows';

export const sendLogToRenderer = (type: string, data: any): void => {
    emitToAllWindows('api-log', {type, data});
};
