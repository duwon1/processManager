import { useEffect, useState } from 'react'
import Login from "./pages/login.jsx"

function App() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/hello') // 스프링에게 요청! (Vite proxy 설정 필요)
        .then(res => res.text())
        .then(data => setMessage(data))
  }, [])

  return (
      <div className="pt-5">
          <Login />
      </div>
  )
}

export default App;