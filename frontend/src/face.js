// 표정·시선 분석 (MediaPipe FaceLandmarker) — 브라우저 온디바이스, 영상은 서버로 전송하지 않음.
// 성능: GPU 델리게이트 + VIDEO 모드 + 프레임당 1회 추론 + 단일 얼굴 + float16 모델.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

let _landmarker = null
let _loading = null

async function getLandmarker() {
  if (_landmarker) return _landmarker
  if (_loading) return _loading
  _loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')
    const opts = (delegate) => ({
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate,
      },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
    })
    try {
      _landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU'))
    } catch {
      _landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU'))
    }
    return _landmarker
  })()
  return _loading
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const std = (a) => { const m = mean(a); return a.length ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : 0 }

// 카메라 미리보기 시작(분석과 분리) — 화상 모드 켜면 항상 내 얼굴이 보이도록.
export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
  videoEl.srcObject = stream
  videoEl.muted = true
  await videoEl.play().catch(() => {})
  getLandmarker().catch(() => {}) // 모델 미리 로드(분석 시 지연 최소화)
  return { stop() { try { stream.getTracks().forEach((t) => t.stop()) } catch {}; try { videoEl.srcObject = null } catch {} } }
}

// 이미 재생 중인 videoEl에 대해 얼굴 분석 루프 실행(스트림은 startCamera가 관리)
export async function runFaceAnalysis(videoEl, onFace) {
  const lm = await getLandmarker()
  const gaze = [], smile = [], blink = [], browDown = [], noseX = [], noseY = []
  const frown = [], eyeWide = [], jaw = []
  let faces = 0, frames = 0
  let raf = null, lastTs = -1

  function bsMap(cats) { const m = {}; for (const c of cats) m[c.categoryName] = c.score; return m }

  function loop() {
    if (videoEl.readyState >= 2) {
      const ts = performance.now()
      if (ts !== lastTs) {
        lastTs = ts; frames++
        let res = null
        try { res = lm.detectForVideo(videoEl, ts) } catch { res = null }
        if (res && res.faceLandmarks && res.faceLandmarks.length) {
          faces++
          const b = res.faceBlendshapes && res.faceBlendshapes[0] ? bsMap(res.faceBlendshapes[0].categories) : {}
          // 시선: 눈동자가 중앙에서 벗어난 정도(좌우상하 최대)
          const g = Math.max(b.eyeLookInLeft || 0, b.eyeLookInRight || 0, b.eyeLookOutLeft || 0,
            b.eyeLookOutRight || 0, b.eyeLookUpLeft || 0, b.eyeLookUpRight || 0,
            b.eyeLookDownLeft || 0, b.eyeLookDownRight || 0)
          gaze.push(g)
          smile.push(((b.mouthSmileLeft || 0) + (b.mouthSmileRight || 0)) / 2)
          blink.push(((b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0)) / 2)
          browDown.push(((b.browDownLeft || 0) + (b.browDownRight || 0)) / 2)
          frown.push(((b.mouthFrownLeft || 0) + (b.mouthFrownRight || 0)) / 2)
          eyeWide.push(((b.eyeWideLeft || 0) + (b.eyeWideRight || 0)) / 2)
          jaw.push(b.jawOpen || 0)
          const nose = res.faceLandmarks[0][1] // 코끝
          if (nose) { noseX.push(nose.x); noseY.push(nose.y) }
          if (onFace) onFace({ found: true, gaze: g })
        } else if (onFace) onFace({ found: false, gaze: 0 })
      }
    }
    raf = requestAnimationFrame(loop)
  }
  loop()

  return {
    stop() {
      if (raf) cancelAnimationFrame(raf)
      // 스트림은 startCamera가 관리하므로 여기서 끄지 않는다(미리보기 유지)
      const faceRatio = frames ? faces / frames : 0
      // 깜빡임 횟수(0.5 임계 상승 에지)
      let blinks = 0
      for (let i = 1; i < blink.length; i++) if (blink[i] >= 0.5 && blink[i - 1] < 0.5) blinks++
      const headMove = (std(noseX) + std(noseY)) * 100 // % 단위 움직임
      // 시선 고정률: 정면 응시(낮은 gaze) 프레임 비율
      const gazeFix = gaze.length ? gaze.filter((g) => g < 0.18).length / gaze.length : 0
      // 고개 끄덕임: 코끝 y의 상하 반전 횟수(진폭 임계)
      let nods = 0, lastDir = 0, lastExt = noseY.length ? noseY[0] : 0
      for (let i = 1; i < noseY.length; i++) {
        const d = noseY[i] - noseY[i - 1]
        const dir = d > 0 ? 1 : d < 0 ? -1 : 0
        if (dir && dir !== lastDir) {
          if (Math.abs(noseY[i - 1] - lastExt) > 0.012) nods++
          lastExt = noseY[i - 1]; lastDir = dir
        }
      }
      // 감정 추정(FER 근사) — blendshape로 라벨 도출(별도 모델 없이 온디바이스)
      const sm = mean(smile), neg = (mean(browDown) + mean(frown)) / 2, wide = mean(eyeWide)
      let emotion = '중립'
      if (sm > 0.12 && sm > neg) emotion = '밝음/긍정'
      else if (neg > 0.18) emotion = '긴장/경직'
      else if (wide > 0.35) emotion = '놀람/불안'
      return {
        samples: faces,
        faceRatio: Math.round(faceRatio * 100),
        gazeAway: Math.round(mean(gaze) * 100),     // 클수록 정면에서 벗어남
        gazeFix: Math.round(gazeFix * 100),         // 정면 응시 비율
        smile: Math.round(mean(smile) * 100),
        blinks,
        nods: Math.round(nods / 2),                 // 끄덕임 추정 횟수
        browDown: Math.round(mean(browDown) * 100),
        headMove: Math.round(headMove * 10) / 10,
        emotion,
      }
    },
  }
}

function dim(key, status, value, msg) { return { key, status, value, msg } }

export function analyzeFace(m) {
  if (!m || m.samples < 5) {
    return { ok: false, dims: [], score: null, note: '얼굴을 충분히 인식하지 못했어요. 카메라 정면·밝은 곳에서 다시 시도해 주세요.' }
  }
  const dims = []
  let bad = 0

  // 1) 시선(아이컨택) — gazeAway 낮을수록 정면 응시
  if (m.gazeAway > 35) { dims.push(dim('시선', 'bad', '자주 회피', '시선이 자주 다른 곳을 향해요. 카메라 렌즈를 면접관 눈이라 생각하고 응시하세요.')); bad += 2 }
  else if (m.gazeAway > 22) { dims.push(dim('시선', 'warn', '가끔 회피', '가끔 시선이 흔들려요. 핵심 문장에서는 카메라를 보세요.')); bad += 1 }
  else dims.push(dim('시선', 'good', '안정적 응시', '정면 응시가 안정적이에요. 좋아요!'))

  // 2) 표정 — 적당한 미소
  if (m.smile < 4 && m.browDown > 25) { dims.push(dim('표정', 'bad', '굳음/찡그림', '표정이 굳어 있어요. 입꼬리를 살짝 올리고 미간을 펴면 인상이 부드러워져요.')); bad += 1 }
  else if (m.smile < 4) { dims.push(dim('표정', 'warn', '무표정', '다소 무표정해요. 밝은 표정이 호감을 높여요.')); }
  else if (m.smile > 45) { dims.push(dim('표정', 'warn', '과한 미소', '미소가 과할 수 있어요. 진중함과 균형을 맞춰보세요.')); }
  else dims.push(dim('표정', 'good', '자연스러움', '표정이 자연스럽고 밝아요.'))

  // 3) 자세(고개 안정) — headMove 적당
  if (m.headMove > 6) { dims.push(dim('자세', 'bad', '많이 흔들림', '고개·몸 움직임이 커요. 안정적으로 앉아 시선을 고정하면 신뢰감이 올라가요.')); bad += 1 }
  else if (m.headMove > 3.5) { dims.push(dim('자세', 'warn', '약간 흔들림', '움직임이 조금 있어요. 어깨를 펴고 차분하게.')); }
  else dims.push(dim('자세', 'good', '안정적', '자세가 안정적이에요.'))

  // 4) 긴장(깜빡임 빈도)
  const bpm = m.samples ? blinkPerMin(m) : 0
  if (bpm > 35) { dims.push(dim('긴장', 'warn', `깜빡임 잦음`, '눈 깜빡임이 잦아요(긴장 신호). 천천히 호흡해보세요.')); bad += 1 }
  else dims.push(dim('긴장', 'good', '침착함', '눈 깜빡임이 안정적이에요.'))

  // 5) 시선 고정률(정면 응시 유지)
  if (m.gazeFix != null) {
    if (m.gazeFix >= 65) dims.push(dim('시선 고정', 'good', `${m.gazeFix}%`, '정면 응시를 잘 유지했어요.'))
    else if (m.gazeFix >= 45) dims.push(dim('시선 고정', 'warn', `${m.gazeFix}%`, '응시 유지가 들쭉날쭉해요. 카메라에 시선을 고정해보세요.'))
    else { dims.push(dim('시선 고정', 'bad', `${m.gazeFix}%`, '정면 응시 시간이 짧아요. 핵심 답변엔 카메라를 보세요.')); bad += 1 }
  }

  // 6) 고개 끄덕임(호응) — 적절하면 경청/소통 인상
  if (m.nods != null) {
    if (m.nods === 0) dims.push(dim('호응(끄덕임)', 'warn', '거의 없음', '고개 끄덕임이 거의 없어 경직돼 보일 수 있어요. 가벼운 호응이 좋아요.'))
    else if (m.nods <= 12) dims.push(dim('호응(끄덕임)', 'good', `${m.nods}회`, '적절한 호응으로 소통감이 좋아요.'))
    else { dims.push(dim('호응(끄덕임)', 'warn', `${m.nods}회 많음`, '움직임이 다소 많아요. 차분하게 줄여보세요.')); bad += 1 }
  }

  // 7) 감정(표정 라벨)
  if (m.emotion) {
    const st = m.emotion === '밝음/긍정' ? 'good' : m.emotion === '중립' ? 'good' : 'warn'
    const msg = m.emotion === '긴장/경직' ? '표정이 굳어 보여요. 미간을 펴고 입꼬리를 살짝 올려보세요.'
      : m.emotion === '놀람/불안' ? '눈을 크게 뜬 긴장 표정이 보여요. 천천히 호흡하며 편안하게.'
      : m.emotion === '밝음/긍정' ? '밝고 긍정적인 표정이에요. 좋습니다!' : '안정적인 표정이에요.'
    dims.push(dim('표정(감정)', st, m.emotion, msg))
    if (m.emotion === '긴장/경직' || m.emotion === '놀람/불안') bad += 1
  }

  const score = Math.max(0, 100 - bad * 15)
  const label = score >= 75 ? '아주 좋음' : score >= 50 ? '보통' : '개선 필요'
  return { ok: true, dims, score, label, faceRatio: m.faceRatio, emotion: m.emotion }
}

function blinkPerMin(m) {
  // samples는 인식 프레임 수 ≈ 시간 비례. 대략 30fps 가정 환산.
  const sec = m.samples / 30
  return sec > 1 ? Math.round((m.blinks / sec) * 60) : m.blinks
}
