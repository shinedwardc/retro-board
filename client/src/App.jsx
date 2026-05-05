import { useState } from 'react'
import Board from './pages/Board';
import Home from './pages/Home';

const App = () => {

  const [session, setSession] = useState(null);

  if (session) {
    return (
      <Board session={session} onLeave={() => setSession(null)} />
    )
  }

  return (
    <Home onJoin={setSession} />
  )
}

export default App
