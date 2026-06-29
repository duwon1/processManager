// 한글(CJK) IME 조합을 고려한 Enter 제출 핸들러.
//
// 한글 입력은 마지막 글자가 "조합 중(composing)" 상태일 수 있고, 이때 누른 Enter는
// 브라우저가 조합 확정용으로 소비하기 때문에 폼이 제출되지 않습니다(= "Enter가 안 먹힌다").
// 조합이 끝난(isComposing=false) Enter에서만 form.requestSubmit()으로 확실히 제출해
// 네이티브 구현 차이와 무관하게 일관되게 동작하도록 합니다.
//
// 사용: <input onKeyDown={submitOnEnter} ... /> (반드시 <form onSubmit> 안에 있어야 함)
export function submitOnEnter(event) {
  if (event.key !== 'Enter') return;
  // 조합 중이거나 길게 눌러 반복 발생한 Enter는 무시합니다.
  if (event.nativeEvent?.isComposing || event.repeat) return;

  const form = event.currentTarget.form;
  // requestSubmit 미지원(구형 브라우저)일 땐 preventDefault 하지 않고 네이티브 제출에 맡깁니다.
  if (!form || typeof form.requestSubmit !== 'function') return;

  event.preventDefault();
  form.requestSubmit();
}
