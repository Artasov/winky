import {getConfig} from '../config';
import {emitToAllWindows} from '../windows/emitToAllWindows';

export const broadcastConfigUpdate = async (): Promise<void> => {
    const config = await getConfig();
    emitToAllWindows('config:updated', config);
};
