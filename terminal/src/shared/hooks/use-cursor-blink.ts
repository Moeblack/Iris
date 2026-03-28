import { useEffect, useState } from "react"

export function useCursorBlink(intervalMs = 530): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((value) => !value)
    }, intervalMs)

    return () => clearInterval(timer)
  }, [intervalMs])

  return visible
}
