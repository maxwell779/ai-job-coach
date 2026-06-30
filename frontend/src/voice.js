// 브라우저 음성 분석 (Web Audio API) — 목소리 떨림·자신감·말 속도·명료도·충분함으로 면접 전달력 진단.
// SpeechRecognition(STT)과 별도의 마이크 스트림을 사용해 동시 동작.

const SILENCE_RMS = 0.012 // 이보다 작으면 '침묵'으로 간주

// 시간영역 파형 자기상관 → 기본주파수(Hz). 무성/잡음이면 -1.
function autoCorrelate(buf, sampleRate) {
  const n = buf.length
  let rms = 0
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / n)
  if (rms < SILENCE_RMS) return { freq: -1, clarity: 0 }
  let r1 = 0, r2 = n - 1
  const thres = 0.2
  for (let i = 0; i < n / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break }
  for (let i = 1; i < n / 2; i++) if (Math.abs(buf[n - i]) < thres) { r2 = n - i; break }
  if (r2 <= r1) return { freq: -1, clarity: 0 }
  const b = buf.slice(r1, r2)
  const m = b.length
  const c = new Array(m).fill(0)
  for (let i = 0; i < m; i++) for (let j = 0; j < m - i; j++) c[i] += b[j] * b[j + i]
  let d = 0
  while (d < m - 1 && c[d] > c[d + 1]) d++
  let maxv = -1, maxp = -1
  for (let i = d; i < m; i++) if (c[i] > maxv) { maxv = c[i]; maxp = i }
  if (maxp <= 0) return { freq: -1, clarity: 0 }
  const freq = sampleRate / maxp
  // clarity ≈ 정규화 자기상관 피크(주기성/HNR 근사, 0~1)
  const clarity = c[0] ? maxv / c[0] : 0
  return { freq: freq > 70 && freq < 500 ? freq : -1, clarity }
}

// onLevel(level 0~1): 실시간 음량 콜백(UI 미터용)
export async function startRecorder(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  src.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  const vols = []
  const pitches = []
  const clarities = []
  const t0 = performance.now()
  let raf = null

  function tick() {
    analyser.getFloatTimeDomainData(buf)
    let rms = 0
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
    rms = Math.sqrt(rms / buf.length)
    vols.push(rms)
    const { freq, clarity } = autoCorrelate(buf, ctx.sampleRate)
    if (freq > 0) { pitches.push(freq); clarities.push(clarity) }
    if (onLevel) onLevel(Math.min(1, rms * 8)) // 시각화용 스케일
    raf = requestAnimationFrame(tick)
  }
  tick()

  return {
    stop() {
      if (raf) cancelAnimationFrame(raf)
      const durationSec = (performance.now() - t0) / 1000
      try { stream.getTracks().forEach((t) => t.stop()) } catch {}
      try { ctx.close() } catch {}
      return computeMetrics(vols, pitches, durationSec, clarities)
    },
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const std = (a) => { const m = mean(a); return a.length ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : 0 }
// 인접 프레임 cycle-to-cycle 상대 변동(jitter/shimmer 근사): 평균 |diff| / 평균
function localVar(a) {
  if (!a || a.length < 2) return 0
  let s = 0; for (let i = 1; i < a.length; i++) s += Math.abs(a[i] - a[i - 1])
  s /= (a.length - 1); const m = mean(a); return m ? s / m : 0
}
// 정규화 자기상관 피크 c(0~1) → HNR(dB), Boersma: HNR=10·log10(c/(1-c))
function hnrDb(c) {
  const x = Math.min(0.999, Math.max(0.001, c || 0))
  return Math.round(10 * Math.log10(x / (1 - x)) * 10) / 10
}

// 3점 메디안 필터 — 자기상관 옥타브 점프(이상치) 제거로 피치/jitter 정확도↑
function medianSmooth(a) {
  if (a.length < 3) return a
  const out = a.slice()
  for (let i = 1; i < a.length - 1; i++) {
    const t = [a[i - 1], a[i], a[i + 1]].sort((x, y) => x - y)
    out[i] = t[1]
  }
  return out
}

function computeMetrics(vols, pitchesRaw, durationSec, clarities = []) {
  const pitches = medianSmooth(pitchesRaw)
  const fps = vols.length / Math.max(durationSec, 0.1)
  const voiced = vols.filter((v) => v >= SILENCE_RMS)
  const speakingRatio = vols.length ? voiced.length / vols.length : 0
  let pauses = 0, run = 0
  const gapFrames = Math.max(1, Math.round(fps * 0.5))
  for (const v of vols) {
    if (v < SILENCE_RMS) { run++; if (run === gapFrames) pauses++ } else run = 0
  }
  const volMean = mean(voiced)
  const volCV = volMean ? std(voiced) / volMean : 0
  const pitchMean = mean(pitches)
  const pitchCV = pitchMean ? std(pitches) / pitchMean : 0
  // Jitter(피치 주기 cycle-to-cycle 변동) — 떨림/긴장의 표준 지표
  const periods = pitches.filter((f) => f > 0).map((f) => 1 / f)
  const jitter = localVar(periods)
  // Shimmer(진폭 cycle-to-cycle 변동) — 목소리 약함/불안정
  const shimmer = localVar(voiced)
  // 말끝 흐림: 후반 25% 발화 음량 / 전체 발화 음량 (1보다 작을수록 끝이 작아짐)
  const tail = vols.slice(Math.floor(vols.length * 0.75)).filter((v) => v >= SILENCE_RMS)
  const endRatio = volMean && tail.length ? mean(tail) / volMean : 1
  return {
    durationSec: Math.round(durationSec * 10) / 10,
    speakingRatio: Math.round(speakingRatio * 100),
    pauses,
    volMean: Math.round(volMean * 1000) / 1000,
    volCV: Math.round(volCV * 100) / 100,
    pitchMean: Math.round(pitchMean),
    pitchCV: Math.round(pitchCV * 100) / 100,
    jitter: Math.round(jitter * 1000) / 1000,
    shimmer: Math.round(shimmer * 1000) / 1000,
    hnr: hnrDb(mean(clarities)), // 음성 명료도 HNR(dB) — Boersma 자기상관법
    endRatio: Math.round(endRatio * 100) / 100,
  }
}

const FILLERS = ['음', '어', '그', '저기', '뭐', '이제', '약간', '인제', '막']

// status: 'good' | 'warn' | 'bad'
function dim(key, status, value, msg) { return { key, status, value, msg } }

// 전달력 진단 (음성 지표 + STT 텍스트) → 차원별 verdict + 종합 긴장도
export function analyzeDelivery(metrics, transcript = '') {
  const text = (transcript || '').replace(/\s+/g, ' ').trim()
  const chars = text.replace(/\s/g, '').length
  const speakDur = Math.max(0.1, metrics.durationSec * (metrics.speakingRatio / 100))
  const charsPerSec = Math.round((chars / speakDur) * 10) / 10

  let fillerCount = 0
  const found = {}
  for (const f of FILLERS) {
    const m = text.match(new RegExp(`(^|\\s)${f}(\\s|$|,|\\.)`, 'g'))
    if (m) { fillerCount += m.length; found[f] = m.length }
  }

  const dims = []
  let tension = 0

  // 1) 떨림/안정감 — jitter(피치 주기 변동)·shimmer(진폭 변동) 표준 지표 + 보조(CV)
  const jit = metrics.jitter || 0, shim = metrics.shimmer || 0
  if (jit > 0.04 || shim > 0.18 || metrics.pitchCV > 0.18) {
    dims.push(dim('떨림', 'bad', '떨림 감지', `목소리가 떨려요(jitter ${(jit * 100).toFixed(1)}%). 깊게 숨 쉬고 한 문장씩 천천히 안정적인 톤으로.`)); tension += 28
  } else if (jit > 0.025 || shim > 0.12 || metrics.pitchCV > 0.12) {
    dims.push(dim('떨림', 'warn', '약간 흔들림', '톤이 조금 흔들려요. 문장 끝까지 같은 높이를 유지해보세요.')); tension += 12
  } else {
    dims.push(dim('떨림', 'good', '안정적', '목소리가 안정적이에요(jitter/shimmer 정상). 좋습니다!'))
  }

  // 2) 자신감 (성량·발화 비율)
  if (metrics.volMean < 0.02 || metrics.speakingRatio < 50) {
    dims.push(dim('자신감', 'bad', '더 당당하게', '목소리가 작거나 머뭇거려요. 더 또렷하고 크게, 자신있게 말할 필요가 있어요.')); tension += 16
  } else if (metrics.volMean < 0.035) {
    dims.push(dim('자신감', 'warn', '조금 더 크게', '성량을 조금만 더 키우면 훨씬 자신감 있게 들려요.')); tension += 6
  } else {
    dims.push(dim('자신감', 'good', '자신감 있음', '성량이 충분해 당당하게 들려요.'))
  }

  // 3) 말 속도
  if (charsPerSec > 7.5) {
    dims.push(dim('말 속도', 'warn', `빠름 ${charsPerSec}자/초`, '말이 빨라요. 긴장 시 빨라지기 쉬우니 의식적으로 또박또박 천천히.')); tension += 18
  } else if (chars > 10 && charsPerSec < 3) {
    dims.push(dim('말 속도', 'warn', `느림 ${charsPerSec}자/초`, '조금 느려요. 자신감 있게 속도를 올려도 좋아요.')); tension += 8
  } else {
    dims.push(dim('말 속도', 'good', `적정 ${charsPerSec || 0}자/초`, '말 속도가 적절해요.'))
  }

  // 4) 명료도 (채움어·침묵)
  if (fillerCount >= 4 || metrics.pauses >= 4) {
    dims.push(dim('명료도', 'bad', `채움어 ${fillerCount}회`, `"${Object.keys(found).join('", "') || '음·어'}" 같은 군말과 긴 침묵을 줄이면 훨씬 또렷해요.`)); tension += 18
  } else if (fillerCount > 0 || metrics.pauses >= 2) {
    dims.push(dim('명료도', 'warn', `채움어 ${fillerCount}회`, '군말을 조금만 줄여보세요.')); tension += 6
  } else {
    dims.push(dim('명료도', 'good', '또렷함', '군말 없이 또렷하게 말했어요.'))
  }

  // 5) 충분함 (답변 길이/시간)
  if (metrics.durationSec < 8 || chars < 30) {
    dims.push(dim('충분함', 'warn', '다소 짧음', '답변이 짧아요. STAR(상황-과제-행동-결과)로 근거를 더 채워보세요.')); tension += 8
  } else {
    dims.push(dim('충분함', 'good', '충분함', '답변 분량이 충분해요.'))
  }

  // 6) 말끝 (문장 끝 자신감)
  if (metrics.endRatio != null && metrics.endRatio < 0.6 && chars > 15) {
    dims.push(dim('말끝', 'bad', '흐려짐', '문장 끝에서 목소리가 작아져요(자신감 부족 인상). 끝까지 또렷하게 맺어보세요.')); tension += 12
  } else if (metrics.endRatio != null && metrics.endRatio < 0.8 && chars > 15) {
    dims.push(dim('말끝', 'warn', '약간 작아짐', '말끝을 조금만 더 단단하게 맺으면 좋아요.')); tension += 5
  } else {
    dims.push(dim('말끝', 'good', '단단함', '문장 끝까지 자신있게 맺었어요.'))
  }

  // 7) 억양(톤) — 음높이 변화가 너무 적으면 단조로움
  if (metrics.pitchMean > 0 && metrics.pitchCV < 0.05 && chars > 15) {
    dims.push(dim('억양', 'warn', '단조로움', '톤 변화가 적어 단조롭게 들려요. 핵심 단어에 강세를 주면 전달력이 올라가요.')); tension += 8
  } else if (metrics.pitchMean > 0 && metrics.pitchCV >= 0.05 && metrics.pitchCV <= 0.15) {
    dims.push(dim('억양', 'good', '생동감 있음', '적절한 억양으로 생동감 있게 들려요.'))
  } else if (metrics.pitchMean > 0) {
    dims.push(dim('억양', 'good', '풍부함', '억양 변화가 있어요.'))
  }

  // 7-b) 음성 명료도(HNR dB) — 또렷함/맑음 (정상 음성 대략 15dB+)
  if (metrics.hnr != null && metrics.pitchMean > 0) {
    if (metrics.hnr >= 13) dims.push(dim('음성 명료도', 'good', `${metrics.hnr}dB 또렷`, '목소리가 또렷하고 맑게 전달돼요(HNR 양호).'))
    else if (metrics.hnr >= 7) dims.push(dim('음성 명료도', 'warn', `${metrics.hnr}dB`, '발음을 또박또박하면 더 또렷하게 들려요.'))
    else { dims.push(dim('음성 명료도', 'bad', `${metrics.hnr}dB 웅얼`, '목소리가 다소 웅얼거려요(잡음↑). 입을 크게 벌려 또박또박.')); tension += 6 }
  }

  // 8) 발화 에너지 — 평균 성량(자신감의 객관 지표, 보조)
  if (metrics.volMean != null) {
    const energy = Math.min(100, Math.round(metrics.volMean * 1400))
    const st = energy >= 50 ? 'good' : energy >= 28 ? 'warn' : 'bad'
    dims.push(dim('발화 에너지', st, `${energy}점`, st === 'good' ? '에너지가 충분해 또렷하게 전달돼요.' : '목소리에 힘을 더 실으면 자신감 있게 들려요.'))
    if (st === 'bad') tension += 6
  }

  const tensionScore = Math.max(0, Math.min(100, tension))
  const level = tensionScore >= 60 ? '긴장 높음' : tensionScore >= 35 ? '약간 긴장' : '안정적'
  return { tensionScore, level, charsPerSec, fillerCount, fillers: found, dims, metrics }
}
