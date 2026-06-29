"use client";

import { useEffect, useRef } from "react";

export default function V2ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrameId: number;

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const observer = new ResizeObserver(syncSize);
    observer.observe(canvas);
    syncSize();

    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
    
    const fs = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
varying vec2 v_texCoord;

void main() {
    vec2 uv = v_texCoord;
    
    // Create soft, drifting mesh-like blobs using sine waves and distance fields
    vec2 p1 = vec2(0.2 + 0.3 * sin(u_time * 0.1), 0.3 + 0.2 * cos(u_time * 0.15));
    vec2 p2 = vec2(0.8 + 0.2 * cos(u_time * 0.12), 0.7 + 0.2 * sin(u_time * 0.08));
    vec2 p3 = vec2(0.5 + 0.15 * sin(u_time * 0.2), 0.5 + 0.15 * cos(u_time * 0.18));
    
    float d1 = length(uv - p1) * 1.5;
    float d2 = length(uv - p2) * 1.2;
    float d3 = length(uv - p3) * 1.8;
    
    float b1 = smoothstep(0.8, 0.0, d1);
    float b2 = smoothstep(0.7, 0.0, d2);
    float b3 = smoothstep(0.9, 0.0, d3);
    
    vec3 color1 = vec3(0.545, 0.361, 0.965); // #8b5cf6
    vec3 color2 = vec3(0.34, 0.15, 0.7);    // Darker violet
    vec3 baseBg = vec3(0.039, 0.039, 0.047); // #0a0a0c
    
    vec3 finalColor = baseBg;
    finalColor += color1 * b1 * 0.12;
    finalColor += color2 * b2 * 0.1;
    finalColor += color1 * b3 * 0.08;
    
    gl_FragColor = vec4(finalColor, 1.0);
}`;

    function createShader(type: number, source: string) {
      if (!gl) return null;
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const prog = gl.createProgram();
    if (!prog) return;
    
    const vertShader = createShader(gl.VERTEX_SHADER, vs);
    const fragShader = createShader(gl.FRAGMENT_SHADER, fs);
    if (!vertShader || !fragShader) return;

    gl.attachShader(prog, vertShader);
    gl.attachShader(prog, fragShader);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = 1.0 - (event.clientY - rect.top) / rect.height;
        mouse.x = nx * canvas.width;
        mouse.y = ny * canvas.height;
      }
    };
    window.addEventListener("mousemove", handleMouseMove);

    function render(t: number) {
      if (!gl || !canvas) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    }
    
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="v2-shader-container">
      <canvas ref={canvasRef} className="v2-shader-canvas" />
    </div>
  );
}
