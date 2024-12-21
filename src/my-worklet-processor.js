export default `
class MyWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  /**
   * AudioWorkletProcessor 的核心处理函数
   * @param inputs: 来自于上一级节点的输入，每个输入可以有多个声道
   * @param outputs: 发往下一级节点的输出
   * @param parameters: 自定义参数
   * @returns Boolean: 返回 true 表示持续处理，false 会让音频处理自动关闭
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const audioData = input[0];
      this.port.postMessage(audioData);
    }
    return true;
  }
}

registerProcessor("my-worklet-processor", MyWorkletProcessor);
`;