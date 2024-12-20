export const DEFAULT_CONFIG = {
    // WebSocket配置
    url: "wss://iat-api.xfyun.cn/v2/iat",
    host: "iat-api.xfyun.cn",
    
    // 语言配置
    language: 'zh_cn',
    accent: 'mandarin',
    
    // API配置
    APPID: '',
    APISecret: '',
    APIKey: '',
    
    // WebSocket业务参数
    business: {
        language: 'zh_cn',
        domain: 'iat',
        accent: 'mandarin',
        vad_eos: 5000,
        dwa: 'wpgs'
    },
    
    // 音频格式
    format: 'audio/L16;rate=16000',
    encoding: 'raw'
}; 