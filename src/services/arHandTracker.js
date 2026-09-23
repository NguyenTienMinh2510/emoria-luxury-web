import {ringPose,braceletPose,smoothHandPose,drawRing,drawBracelet} from './arHandGeometry.js';
import {AR3DScene,isWebGLAvailable} from './ar3DRenderer.js';

export class HandTracker {
  constructor(video, canvas, config, onState) {
    Object.assign(this, {
      video,
      canvas,
      config,
      onState,
      closed: false,
      manual: false,
      options: {
        size: config.defaultSize || (config.type === 'ring' ? 17 : 16),
        scale: 1,
        offset: 0,
        finger: config.finger || 'ring'
      },
      lastFrame: -1,
      lastRequest: 0,
      lastSeen: 0,
      pose: null,
      scene3d: null
    });
  }

  state(value) {
    if (!this.closed && value !== this.lastState) {
      this.lastState = value;
      this.onState(value);
    }
  }

  async start() {
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(Error('Camera requires HTTPS'), { name: 'UnsupportedError' });
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 720 },
        height: { ideal: 960 },
        frameRate: { ideal: 24, max: 30 }
      }
    });

    if (this.closed) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    this.stream = stream;
    this.video.srcObject = stream;

    try {
      await this.video.play();
      if (this.closed) return;

      if (this.config.asset && !this.config.modelUrl) {
        this.image = new Image();
        this.image.src = this.config.asset;
        await this.image.decode().catch(() => {});
      }
      if (this.closed) return;

      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      this.ctx = this.canvas.getContext('2d', { alpha: false });

      if(this.config.modelUrl&&typeof window!=='undefined'&&!isWebGLAvailable())throw Object.assign(Error('WebGL2 required'),{name:'Unsupported3DError'});
      if (this.config.modelUrl && isWebGLAvailable()) {
        try {
          this.scene3d = new AR3DScene(this.canvas.width, this.canvas.height);
          await this.scene3d.setModel(this.config.productId, this.config.type, {
            modelUrl: this.config.modelUrl,
            size: this.options.size,
            offset: this.options.offset,
            scale: this.options.scale,
            ringScale: this.config.scale || 0.22,
            braceletScale: this.config.scale || 0.35
          });
        } catch (error) {
          this.scene3d?.dispose();this.scene3d = null;
          throw Object.assign(error,{name:"ModelLoadError"});
        }
      }

      if(this.closed)return;
      this.render = () => {
        if (this.closed) return;
        const now = performance.now();
        if(now-(this.lastRender||0)<33){this.frame=requestAnimationFrame(this.render);return;}this.lastRender=now;
        const { width, height } = this.canvas;

        this.ctx.save();
        this.ctx.translate(width, 0);
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(this.video, 0, 0, width, height);

        const pose = this.manual
          ? {
              x: width / 2,
              y: height * 0.55,
              z: 0,
              span: Math.min(width * 0.35, height * 0.3),
              angle: this.config.type==='ring'?-Math.PI/2:0,
              type: this.config.type
            }
          : now - this.lastSeen < 350
          ? this.pose
          : null;

        if (pose && this.scene3d && this.scene3d.renderer) {
          this.scene3d.updatePose3D(pose, this.config.type);
          this.scene3d.render();
          this.ctx.drawImage(this.scene3d.domElement, 0, 0);
        } else if (pose) {
          if (this.config.type === 'ring') {
            drawRing(this.ctx, pose, null, {
              ...this.options,
              ringScale: this.config.scale || 0.22
            });
          } else {
            drawBracelet(this.ctx, pose, null, {
              ...this.options,
              braceletScale: this.config.scale || 0.35
            });
          }
        }

        this.ctx.restore();

        if (!this.manual && this.workerReady) {
          this.state(pose ? 'tracking' : 'searching');
          if (!this.busy && this.video.currentTime !== this.lastFrame && now - this.lastRequest >= 83) {
            this.lastRequest = now;
            this.lastFrame = this.video.currentTime;
            this.busy = true;
            const ratio = Math.min(1, 512 / Math.max(width, height));
            createImageBitmap(this.video, {
              resizeWidth: Math.round(width * ratio),
              resizeHeight: Math.round(height * ratio)
            })
              .then(bitmap => {
                if (this.closed || !this.worker) {
                  bitmap.close();
                  return;
                }
                this.worker.postMessage({ type: 'frame', bitmap, time: now }, [bitmap]);
              })
              .catch(() => this.fallback());
          }
        }

        this.frame = requestAnimationFrame(this.render);
      };

      this.render();
      this.state('loading-model');
      this.initWorker();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  initWorker() {
    if (!globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap) {
      this.fallback();
      return;
    }
    try {
      this.worker = new Worker(new URL('./arHand.worker.js', import.meta.url), { type: 'module' });
      this.worker.onerror = () => this.fallback();
      this.worker.onmessage = ({ data }) => {
        if (this.closed) return;
        if (data.type === 'ready') {
          clearTimeout(this.modelTimer);
          this.workerReady = true;
          this.state('searching');
        } else if (data.type === 'hand') {
          this.busy = false;
          const now = performance.now();
          const rawPose =
            this.config.type === 'ring'
              ? ringPose(data.points, this.canvas.width, this.canvas.height, this.options.finger)
              : braceletPose(data.points, this.canvas.width, this.canvas.height);

          this.pose = smoothHandPose(this.pose, rawPose, now - (this.lastSeen || now - 100));
          if (rawPose) this.lastSeen = now;
        } else if (data.type === 'error') {
          this.fallback();
        }
      };
      this.modelTimer = setTimeout(() => this.fallback(), 30000);
      this.worker.postMessage({ type: 'init' });
    } catch {
      this.fallback();
    }
  }

  fallback() {
    if (this.closed) return;
    clearTimeout(this.modelTimer);
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
    this.busy = false;
    this.manual = true;
    this.state('manual-fallback');
  }

  setOptions(options){
    Object.assign(this.options,options);
    this.scene3d?.setOptions({...this.options,pendantScale:this.config.pendantScale});
  }
  setManual(manual) {
    this.manual = manual || !this.workerReady;
    this.pose = null;
    this.lastSeen = 0;
    this.state(this.manual ? 'manual' : 'searching');
  }

  snapshot() {
    if (this.closed || !['tracking', 'manual', 'manual-fallback'].includes(this.lastState)) {
      return Promise.reject(Error('No valid AR frame'));
    }
    const copy = document.createElement('canvas');
    copy.width = this.canvas.width;
    copy.height = this.canvas.height;
    const ctx = copy.getContext('2d');
    ctx.drawImage(this.canvas, 0, 0);
    ctx.fillStyle = '#0009';
    ctx.fillRect(0, copy.height - 58, copy.width, 58);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(16, copy.width * 0.027)}px Georgia`;
    ctx.fillText('E M O R I A  ·  Virtual Try-On', 20, copy.height - 23);
    return new Promise((resolve, reject) =>
      copy.toBlob(blob => (blob ? resolve(blob) : reject(Error('Snapshot failed'))), 'image/jpeg', 0.92)
    );
  }

  stop() {
    this.closed = true;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.modelTimer);
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.video?.pause();
    if (this.video) this.video.srcObject = null;
    if (this.scene3d) {
      this.scene3d.dispose();
      this.scene3d = null;
    }
  }
}
