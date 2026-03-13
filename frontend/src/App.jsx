import { useEffect, useState } from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'; // 부트스트랩 CSS 불러오기

function App() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/hello') // 스프링에게 요청! (Vite proxy 설정 필요)
        .then(res => res.text())
        .then(data => setMessage(data))
  }, [])

  return (
      <div className="w-100 min-vh-100 d-flex align-items-center justify-content-center bg-black m-0 p-0">

      </div>
  )
}

export default App;