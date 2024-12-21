# xunfei-iat

一个基于科大讯飞语音听写（流式版）WebAPI 的语音识别库，支持实时语音转文字功能。该库提供了 WebSocket 连接和音频处理的完整实现，方便开发者快速集成语音识别功能。

## 功能特点

- 实时语音转文字
- 支持流式识别
- 支持普通话和多种方言
- 提供完整的 WebSocket 连接实现
- 内置音频处理功能
- 支持浏览器环境

## 安装

```bash
npm i xunfei-iat
```

## 使用方法

### 基础用法

```javascript
import XunfeiIatRecorder from 'xunfei-iat';

const recorder = new XunfeiIatRecorder({
    // 必填项
    APPID: '您的APPID',
    APISecret: '您的APISecret',
    APIKey: '您的APIKey',
    
    // 可选配置
    onTextChange: (text) => {
        console.log('实时识别结果:', text);
    },
    onFinalResult: (text) => {
        console.log('最终识别结果:', text);
    }
});

// 开始录音识别
recorder.start();

// 停止录音识别
recorder.stop();

// 销毁实例，释放资源
recorder.destroy();
```

## 注意事项

1. 使用前需要在[科大讯飞开放平台](https://www.xfyun.cn/)注册账号并创建应用
2. 需要在支持 WebSocket 的浏览器环境中使用
3. 需要获取用户的麦克风权限
4. 建议在 HTTPS 环境下使用

## 许可证

MIT

## 作者

Harrison Wang

## 问题反馈

如果您在使用过程中遇到任何问题，欢迎提交 Issue。
