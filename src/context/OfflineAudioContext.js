"use strict";

const util = require("../util");
const audioDataUtil = require("../util/audioDataUtil");
const AudioContext = require("../api/AudioContext");
const AudioBuffer = require("../api/AudioBuffer");
const setImmediate = global.setImmediate || /* istanbul ignore next */ (fn => setTimeout(fn, 0));

class OfflineAudioContext extends AudioContext {
  /**
   * @param {number} numberOfChannels
   * @param {number} length
   * @param {number} sampleRate
   */
  constructor(numberOfChannels, length, sampleRate) {
    numberOfChannels = util.toValidNumberOfChannels(numberOfChannels);
    length = Math.max(0, length|0);
    sampleRate = util.toValidSampleRate(sampleRate);

    super({ sampleRate, numberOfChannels });

    this._impl.$oncomplete = null;

    util.defineProp(this, "_numberOfChannels", numberOfChannels);
    util.defineProp(this, "_length", length);
    util.defineProp(this, "_suspendedTime", Infinity);
    util.defineProp(this, "_suspendPromise", null);
    util.defineProp(this, "_suspendResolve", null);
    util.defineProp(this, "_renderingPromise", null);
    util.defineProp(this, "_renderingResolve", null);
    util.defineProp(this, "_renderingIterations", 128);
    util.defineProp(this, "_audioData", null);
    util.defineProp(this, "_writeIndex", 0);
  }

  /**
   * @return {function}
   */
  get oncomplete() {
    return this._impl.$oncomplete;
  }

  /**
   * @param {function} callback
   */
  set oncomplete(callback) {
    this._impl.replaceEventListener("complete", this._impl.$oncomplete, callback);
    this._impl.$oncomplete = callback;
  }

  /**
   * @return {Promise<void>}
   */
  resume() {
    if (this.state === "suspended" && this._renderingPromise !== null) {
      render.call(this, this._impl);
    }
    return Promise.resolve();
  }

  /**
   * @param {number} time
   * @return {Promise<void>}
   */
  suspend(time) {
    time = Math.max(0, util.toNumber(time));

    this._suspendedTime = time;

    if (this._suspendPromise === null) {
      this._suspendPromise = new Promise((resolve) => {
        this._suspendResolve = resolve;
      });
    }

    return this._suspendPromise;
  }

  /**
   * @return {Promise<void>}
   */
  /* istanbul ignore next */
  close() {
    return Promise.reject();
  }

  /**
   * @return {Promise<AudioBuffer>}
   */
  startRendering() {
    if (this._renderingPromise === null) {
      this._renderingPromise = new Promise((resolve) => {
        const numberOfChannels = this._numberOfChannels;
        const length = this._length;
        const sampleRate = this.sampleRate;
        const blockSize = this._impl.blockSize;

        this._audioData = createRenderingAudioData(numberOfChannels, length, sampleRate, blockSize);
        this._renderingResolve = resolve;

        render.call(this, this._impl);
      });
    }
    return this._renderingPromise;
  }
}

function createRenderingAudioData(numberOfChannels, length, sampleRate, blockSize) {
  length = Math.ceil(length / blockSize) * blockSize;

  const channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(length));

  return { numberOfChannels, length, sampleRate, channelData };
}

function suspendRendering() {
  if (this._suspendResolve !== null) {
    this._suspendResolve();
    this._suspendedTime = Infinity;
    this._suspendPromise = this._suspendResolve = null;
    this._impl.changeState("suspended");
  }
}

function doneRendering(audioData) {
  const length = this._length;

  audioData.channelData = audioData.channelData.map((channelData) => {
    return channelData.subarray(0, length);
  });
  audioData.length = length;

  const audioBuffer = audioDataUtil.toAudioBuffer(audioData, AudioBuffer);

  this._impl.changeState("closed");
  this._impl.dispatchEvent({ type: "complete", renderedBuffer: audioBuffer });

  this._renderingResolve(audioBuffer);
  this._renderingResolve = null;
}

function render(impl) {
  const audioData = this._audioData;
  const audioDataLength = audioData.length;
  const channelData = audioData.channelData;
  const blockSize = impl.blockSize;
  const renderingIterations = this._renderingIterations;

  let writeIndex = this._writeIndex;

  const loop = () => {
    const remainIterations = ((audioDataLength - writeIndex) / blockSize);
    const iterations = Math.min(renderingIterations, remainIterations)|0;

    for (let i = 0; i < iterations; i++) {
      if (this._suspendedTime <= impl.currentTime) {
        this._writeIndex = writeIndex;
        return suspendRendering.call(this);
      } else {
        impl.process(channelData, writeIndex);
        writeIndex += blockSize;
      }
    }
    this._writeIndex = writeIndex;

    if (writeIndex === audioDataLength) {
      doneRendering.call(this, audioData);
    } else {
      setImmediate(loop);
    }
  };

  impl.changeState("running");

  setImmediate(loop);
}

module.exports = OfflineAudioContext;
