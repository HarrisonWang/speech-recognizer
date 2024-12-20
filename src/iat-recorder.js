import CryptoJS from 'crypto-js';
import { DEFAULT_CONFIG } from './constants';
import Worker from './audio-transcoder.worker.js';

export class IatRecorder {
    constructor(opts = {}) {
        // 合并默认配置
        this.config = {
            ...DEFAULT_CONFIG,
            ...opts
        };

        // 服务接口认证信息
        this.APPID = this.config.APPID;
        this.APISecret = this.config.APISecret;
        this.APIKey = this.config.APIKey;

        // webSocket配置
        this.url = this.config.url;
        this.host = this.config.host;

        // 回调方法
        this.onTextChange = this.config.onTextChange || Function();
        this.onWillStatusChange = this.config.onWillStatusChange || Function();
        this.onFinalResult = this.config.onFinalResult || Function();

        // 状态相关
        this.status = 'null';
        this.language = this.config.language;
        this.accent = this.config.accent;

        // 数据存储
        this.streamRef = [];
        this.audioData = [];
        this.resultText = '';
        this.resultTextTemp = '';

        // 初始化
        this.init();
    }

    // 获取webSocket请求地址鉴权
    async getWebSocketUrl() {
        const { url, host, APISecret, APIKey } = this;
        try {
            const date = new Date().toGMTString();
            const algorithm = 'hmac-sha256';
            const headers = 'host date request-line';
            const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
            const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, APISecret);
            const signature = CryptoJS.enc.Base64.stringify(signatureSha);
            const authorizationOrigin = `api_key="${APIKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
            const authorization = btoa(authorizationOrigin);
            
            return `${url}?authorization=${authorization}&date=${date}&host=${host}`;
        } catch (error) {
            throw new Error('获取WebSocket URL失败: ' + error.message);
        }
    }

    // 初始化
    init() {
        if (!this.APPID || !this.APIKey || !this.APISecret) {
            throw new Error('请正确配置讯飞语音听写服务接口认证信息！');
        }

        // 初始化 Web Worker
        this.webWorker = new Worker();
        this.webWorker.onmessage = (event) => {
            this.audioData.push(...event.data);
        };
    }

    // 修改录音听写状态
    setStatus(status) {
        this.onWillStatusChange && this.status !== status && this.onWillStatusChange(this.status, status);
        this.status = status;
    }

    // 设置识别结果内容
    setResultText({ resultText, resultTextTemp } = {}) {
        this.onTextChange && this.onTextChange(resultTextTemp || resultText || '');
        resultText !== undefined && (this.resultText = resultText);
        resultTextTemp !== undefined && (this.resultTextTemp = resultTextTemp);
    }

    // 修改听写参数
    setParams({ language, accent } = {}) {
        language && (this.language = language);
        accent && (this.accent = accent);
    }

    // 对处理后的音频数据进行base64编码
    toBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    // 连接WebSocket
    async connectWebSocket() {
        const url = await this.getWebSocketUrl();
        let iatWS;
        if ('WebSocket' in window) {
            iatWS = new WebSocket(url);
        } else if ('MozWebSocket' in window) {
            iatWS = new MozWebSocket(url);
        } else {
            throw new Error('浏览器不支持WebSocket!');
        }
        
        this.webSocket = iatWS;
        this.setStatus('init');
        
        iatWS.onopen = () => {
            this.setStatus('ing');
            setTimeout(() => {
                this.webSocketSend();
            }, 500);
        };
        
        iatWS.onmessage = e => {
            this.webSocketRes(e.data);
        };
        
        iatWS.onerror = e => {
            this.recorderStop(e);
        };
        
        iatWS.onclose = e => {
            this.recorderStop(e);
        };
    }

    // 初始化浏览器录音
    recorderInit() {
        try {
            this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
            this.audioContext.resume();
            if (!this.audioContext) {
                throw new Error('浏览器不支持webAudioApi相关接口');
            }
        } catch (e) {
            throw new Error('浏览器不支持webAudioApi相关接口');
        }

        // 获取浏览器录音权限成功时回调
        const getMediaSuccess = () => {
            this.scriptProcessor = this.audioContext.createScriptProcessor(0, 1, 1);
            this.scriptProcessor.onaudioprocess = e => {
                if (this.status === 'ing') {
                    try {
                        this.webWorker.postMessage(e.inputBuffer.getChannelData(0));
                    } catch (error) { }
                }
            };
            
            this.mediaSource = this.audioContext.createMediaStreamSource(this.streamRef);
            this.mediaSource.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);
            this.connectWebSocket();
        };

        // 获取浏览器录音权限失败时回调
        const getMediaFail = (e) => {
            throw new Error('录音权限获取失败: ' + e.message);
        };

        // 获取浏览器录音权限
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({
                audio: true
            }).then(stream => {
                this.streamRef = stream;
                getMediaSuccess();
            }).catch(getMediaFail);
        } else if (navigator.getUserMedia) {
            navigator.getUserMedia({
                audio: true
            }, (stream) => {
                this.streamRef = stream;
                getMediaSuccess();
            }, getMediaFail);
        } else {
            throw new Error('浏览器不支持录音功能');
        }
    }

    // 向webSocket发送数据
    webSocketSend() {
        if (this.webSocket.readyState !== 1) return false;
        
        const audioData = this.audioData.splice(0, 1280);
        const params = {
            common: {
                app_id: this.APPID,
            },
            business: {
                language: this.language,
                domain: 'iat',
                accent: this.accent,
                vad_eos: 5000,
                dwa: 'wpgs'
            },
            data: {
                status: 0,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: this.toBase64(audioData)
            }
        };

        this.webSocket.send(JSON.stringify(params));

        this.handlerInterval = setInterval(() => {
            if (this.webSocket.readyState !== 1) {
                this.audioData = [];
                clearInterval(this.handlerInterval);
                return false;
            }

            if (this.audioData.length === 0) {
                if (this.status === 'end') {
                    this.webSocket.send(JSON.stringify({
                        data: {
                            status: 2,
                            format: 'audio/L16;rate=16000',
                            encoding: 'raw',
                            audio: ''
                        }
                    }));
                    this.audioData = [];
                    clearInterval(this.handlerInterval);
                }
                return false;
            }

            // 中间帧
            this.webSocket.send(JSON.stringify({
                data: {
                    status: 1,
                    format: 'audio/L16;rate=16000',
                    encoding: 'raw',
                    audio: this.toBase64(this.audioData.splice(0, 1280))
                }
            }));
        }, 40);
    }

    // 处理WebSocket返回数据
    webSocketRes(resultData) {
        const jsonData = JSON.parse(resultData);
        if (jsonData.data && jsonData.data.result) {
            const data = jsonData.data.result;
            let str = '';
            const ws = data.ws;
            for (let i = 0; i < ws.length; i++) {
                str += ws[i].cw[0].w;
            }
            
            if (data.pgs) {
                if (data.pgs === 'apd') {
                    this.setResultText({
                        resultText: this.resultTextTemp
                    });
                }
                this.setResultText({
                    resultTextTemp: this.resultText + str
                });
            } else {
                this.setResultText({
                    resultText: this.resultText + str
                });
            }
        }
        
        if (jsonData.code === 0 && jsonData.data.status === 2) {
            this.onFinalResult(this.resultTextTemp);
            this.webSocket.close();
        }
        if (jsonData.code !== 0) {
            this.webSocket.close();
        }
    }

    // 启动录音
    recorderStart() {
        if (!this.audioContext) {
            this.recorderInit();
        } else {
            this.audioContext.resume();
            this.connectWebSocket();
        }
    }

    // 停止录音
    recorderStop() {
        if (!(/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))) {
            this.audioContext?.suspend();
        }
        this.setStatus('end');
    }

    // 开始识别
    start() {
        this.recorderStart();
        this.setResultText({ resultText: '', resultTextTemp: '' });
    }

    // 停止识别
    stop() {
        this.recorderStop();
    }

    // 清理资源
    destroy() {
        this.stop();
        if (this.webWorker) {
            this.webWorker.terminate();
            this.webWorker = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.webSocket) {
            this.webSocket.close();
            this.webSocket = null;
        }
    }
} 