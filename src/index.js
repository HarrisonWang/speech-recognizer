import CryptoJS from 'crypto-js';
import { DEFAULT_CONFIG } from './constants';
import Worker from 'web-worker:./audio-transcoder.js';
import processorCode from './audio-processor.js';

/**
 * 讯飞实时语音识别 SDK
 * @class
 */
export class SpeechRecognizer {
    /**
     * 创建语音听写实例
     * @param {Object} opts - 配置选项
     * @param {string} opts.APPID - 讯飞开放平台应用 ID
     * @param {string} opts.APISecret - 讯飞开放平台应用密钥
     * @param {string} opts.APIKey - 讯飞开放平台应用 APIKey
     * @param {string} [opts.language='zh_cn'] - 识别语言
     * @param {string} [opts.accent='mandarin'] - 方言类型
     * @param {Function} [opts.onTextChange] - 识别文本变化回调
     * @param {Function} [opts.onWillStatusChange] - 状态变化回调
     * @param {Function} [opts.onFinalResult] - 最终识别结果回调
     */
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

    /**
     * 获取 WebSocket 鉴权地址
     * @private
     * @returns {Promise<string>} WebSocket URL
     * @throws {Error} 获取 URL 失败时抛出错误
     */
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

    /**
     * 初始化录音和 Web Worker
     * @private
     * @throws {Error} 配置错误或初始化失败时抛出错误
     */
    init() {
        if (!this.APPID || !this.APIKey || !this.APISecret) {
            throw new Error('请正确配置讯飞语音听写服务接口认证信息！');
        }

        try {
            this.worker = new Worker();
            this.worker.onmessage = (event) => {
                // 处理 Web Worker 返回的数据
                this.audioData.push(...event.data);
            };
        } catch (error) {
            console.error('Web Worker 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 设置录音状态
     * @private
     * @param {string} status - 新状态
     */
    setStatus(status) {
        this.onWillStatusChange && this.status !== status && this.onWillStatusChange(this.status, status);
        this.status = status;
    }

    /**
     * 设置识别结果内容
     * @private
     * @param {Object} result - 识别结果对象
     * @param {string} [result.resultText] - 识别文本
     * @param {string} [result.resultTextTemp] - 临时识别文本
     */
    setResultText({ resultText, resultTextTemp } = {}) {
        this.onTextChange && this.onTextChange(resultTextTemp || resultText || '');
        resultText !== undefined && (this.resultText = resultText);
        resultTextTemp !== undefined && (this.resultTextTemp = resultTextTemp);
    }

    /**
     * 设置识别参数
     * @public
     * @param {Object} params - 参数对象
     * @param {string} [params.language] - 识别语言
     * @param {string} [params.accent] - 方言类型
     */
    setParams(params = {}) {
        params.language && (this.language = params.language);
        params.accent && (this.accent = params.accent);
    }

    /**
     * 对处理后的音频数据进行base64编码
     * @private
     * @param {ArrayBuffer} buffer - 音频数据
     * @returns {string} base64编码后的字符串
     */
    toBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * 连接 WebSocket
     * @private
     * @throws {Error} 浏览器不支持 WebSocket 时抛出错误
     */
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

    /**
     * 初始化浏览器录音
     * @private
     * @throws {Error} 浏览器不支持 WebAudio API 相关接口时抛出错误
     */
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
        const getMediaSuccess = async () => {
            try {
                // // 1. 在主线程加载你的 AudioWorklet 脚本
                // await this.audioContext.audioWorklet.addModule('audio-processor.js');
                // 1.1 将 Worklet 代码包装成 Blob => 转为临时 URL
                const blob = new Blob([processorCode], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);

                // 1.2. 通知 AudioContext 加载模块
                await this.audioContext.audioWorklet.addModule(url);

                // 2. 创建 AudioWorkletNode 实例，与处理器脚本绑定
                this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

                // 3. 监听从处理器脚本发回来的音频数据
                this.audioWorkletNode.port.onmessage = (event) => {
                    if (this.status === 'ing') {
                        try {
                            this.worker.postMessage(event.data);
                        } catch (error) {
                            console.error('处理音频数据失败: ' + error.message);
                        }
                    }
                };

                // 4. 连接输入音源（麦克风音轨）到 AudioWorkletNode
                this.mediaSource = this.audioContext.createMediaStreamSource(this.streamRef);
                this.mediaSource.connect(this.audioWorkletNode);

                // 5. 如果不需要在网页上实时播放，则不一定要 connect 到 destination
                // this.audioWorkletNode.connect(this.audioContext.destination);

                // 6. 连接到 WebSocket
                this.connectWebSocket();
            } catch (error) {
                console.error('AudioWorklet 初始化失败: ', error);
            }
        };

        // 获取浏览器录音权限失败时回调
        const getMediaFail = (e) => {
            throw new Error('录音权限获取失败: ' + e.message);
        };

        // 获取浏览器录音权限
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.streamRef = stream;
                    getMediaSuccess();
            }).catch(getMediaFail);
        } else if (navigator.getUserMedia) {
            navigator.getUserMedia({ audio: true }, (stream) => {
                this.streamRef = stream;
                getMediaSuccess();
            }, getMediaFail);
        } else {
            throw new Error('浏览器不支持录音功能');
        }
    }

    /**
     * 向 WebSocket 发送数据
     * @private
     * @returns {boolean} 发送成功返回 true，否则返回 false
     */
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

    /**
     * 处理 WebSocket 返回数据
     * @private
     * @param {string} resultData - WebSocket 返回的数据
     */
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

    /**
     * 启动录音
     * @public
     */
    recorderStart() {
        if (!this.audioContext) {
            this.recorderInit();
        } else {
            this.audioContext.resume();
            this.connectWebSocket();
        }
    }

    /**
     * 停止录音
     * @public
     */
    recorderStop() {
        if (!(/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))) {
            this.audioContext?.suspend();
        }
        this.setStatus('end');
    }

    /**
     * 开始语音识别
     * @public
     */
    start() {
        this.recorderStart();
        this.setResultText({ resultText: '', resultTextTemp: '' });
    }

    /**
     * 停止语音识别
     * @public
     */
    stop() {
        this.recorderStop();
    }

    /**
     * 销毁实例，释放资源
     * @public
     */
    destroy() {
        this.stop();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
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