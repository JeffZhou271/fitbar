const canvas = document.querySelector('#previewCanvas');
const ctx = canvas.getContext('2d');
let t = 0;

function draw() {
  t += 0.025;
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#10231b';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  ctx.strokeStyle = '#f2b84b';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = 0; x <= width; x += 8) {
    const y = height * 0.55 + Math.sin(x * 0.015 + t) * 90;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const dotX = width * 0.38;
  const dotY = height * 0.55 + Math.sin(dotX * 0.015 + t) * 90 + Math.sin(t * 4) * 12;
  ctx.fillStyle = '#e76f51';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 18, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(draw);
}

draw();
