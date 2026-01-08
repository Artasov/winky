import {resultBridge} from '../winkyBridge/windowsBridge';
import {clipboardBridge} from '../winkyBridge/clipboardBridge';
import {authBridge} from '../winkyBridge/authBridge';
import {actionsBridge, iconsBridge} from '../winkyBridge/actionsBridge';
import {profileBridge} from '../winkyBridge/profileBridge';
import {configBridge} from '../winkyBridge/configBridge';
import {speechBridge} from '../winkyBridge/speechBridge';
import {llmBridge} from '../winkyBridge/llmBridge';
import {resourcesBridge} from '../winkyBridge/resourcesBridge';
import {notificationsBridge} from '../winkyBridge/notificationsBridge';
import {windowControlsBridge, windowsBridge} from '../winkyBridge/windowsBridge';
import {actionHotkeysBridge} from '../winkyBridge/actionHotkeysBridge';
import {localSpeechBridge} from '../winkyBridge/localSpeechBridge';
import {ollamaBridge} from '../winkyBridge/ollamaBridge';
import {micBridge} from '../winkyBridge/micBridge';
import {historyBridge} from '../winkyBridge/historyBridge';
import {notesBridge} from '../winkyBridge/notesBridge';

export type {ResultPayload} from './windows/ResultWindowManager';

export {
    resultBridge,
    clipboardBridge,
    authBridge,
    actionsBridge,
    iconsBridge,
    profileBridge,
    configBridge,
    speechBridge,
    llmBridge,
    resourcesBridge,
    notificationsBridge as notificationBridge,
    windowControlsBridge,
    windowsBridge as windowBridge,
    actionHotkeysBridge,
    localSpeechBridge,
    ollamaBridge,
    micBridge,
    historyBridge,
    notesBridge
};
