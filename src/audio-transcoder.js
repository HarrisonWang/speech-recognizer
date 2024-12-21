/**
 * 音频转换工具，用于 Web Worker 中处理音频数据
 * @namespace
 */
export const AudioTranscoder = {
    /**
     * 将音频采样率转换为 16kHz
     * @param {Float32Array} audioData - 原始音频数据
     * @returns {Float32Array} 转换后的 16kHz 音频数据
     */
    to16kHz(audioData) {
        const sourceData = new Float32Array(audioData);
        const targetSampleCount = Math.round(sourceData.length * (16000 / 44100));
        const resampledData = new Float32Array(targetSampleCount);
        const interpolationFactor = (sourceData.length - 1) / (targetSampleCount - 1);
        
        resampledData[0] = sourceData[0];
        for (let targetIndex = 1; targetIndex < targetSampleCount - 1; targetIndex++) {
            const sourcePosition = targetIndex * interpolationFactor;
            const leftIndex = Math.floor(sourcePosition);
            const rightIndex = Math.ceil(sourcePosition);
            const interpolationPoint = sourcePosition - leftIndex;
            resampledData[targetIndex] = sourceData[leftIndex] + 
                (sourceData[rightIndex] - sourceData[leftIndex]) * interpolationPoint;
        }
        resampledData[targetSampleCount - 1] = sourceData[sourceData.length - 1];
        return resampledData;
    },

    /**
     * 将音频数据转换为 16 位 PCM 格式
     * @param {Float32Array} input - 输入的音频数据（范围 -1 到 1）
     * @returns {DataView} 转换后的 16 位 PCM 数据
     */
    to16BitPCM(input) {
        const bytesPerSample = 16 / 8;
        const bufferLength = input.length * bytesPerSample;
        const pcmBuffer = new ArrayBuffer(bufferLength);
        const pcmDataView = new DataView(pcmBuffer);
        let byteOffset = 0;
        
        for (let sampleIndex = 0; sampleIndex < input.length; sampleIndex++, byteOffset += 2) {
            const normalizedSample = Math.max(-1, Math.min(1, input[sampleIndex]));
            const pcmValue = normalizedSample < 0 ? normalizedSample * 0x8000 : normalizedSample * 0x7fff;
            pcmDataView.setInt16(byteOffset, pcmValue, true);
        }
        return pcmDataView;
    },

    /**
     * 转码主函数：将音频数据转换为讯飞语音识别所需的格式
     * @param {Float32Array} audioData - 原始音频数据
     * @returns {Uint8Array} 转换后的音频数据
     */
    transcode(audioData) {
        const resampledData = this.to16kHz(audioData);
        const pcmData = this.to16BitPCM(resampledData);
        return Array.from(new Uint8Array(pcmData.buffer));
    }
};

/**
 * Web Worker 入口点
 * 监听主线程消息并处理音频数据
 * @listens message
 */
if (typeof self !== 'undefined') {
    self.onmessage = function(event) {
        const transcoded = AudioTranscoder.transcode(event.data);
        self.postMessage(transcoded);
    };
}
