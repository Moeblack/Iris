import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useAppContext } from "@opentui/react"

export function usePaste(handler: (text: string) => void): void {
  const { keyHandler } = useAppContext()
  const handlerRef = useRef(handler)

  useLayoutEffect(() => {
    handlerRef.current = handler
  })

  const stableHandler = useCallback((event: { bytes: Uint8Array }) => {
    handlerRef.current(new TextDecoder().decode(event.bytes))
  }, [])

  useEffect(() => {
    keyHandler?.on("paste", stableHandler)
    return () => {
      keyHandler?.off("paste", stableHandler)
    }
  }, [keyHandler, stableHandler])
}
