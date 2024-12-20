import { IatRecorder } from './iat-recorder';

// 导出默认类
export default class XunfeiIatRecorder extends IatRecorder {
    constructor(opts = {}) {
        super(opts);
    }
}

// 同时导出基础类，以便用户可以继承扩展
export { IatRecorder };
