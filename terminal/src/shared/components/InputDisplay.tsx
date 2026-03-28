interface InputDisplayProps {
  value: string
  cursor: number
  isActive: boolean
  cursorVisible: boolean
  placeholder?: string
  transform?: (value: string) => string
}

export function InputDisplay({ value, cursor, isActive, cursorVisible, placeholder, transform }: InputDisplayProps) {
  const display = transform ? transform(value) : value

  if (!display && !isActive) {
    return <text fg="#636e72">{placeholder || ""}</text>
  }

  if (!display) {
    return (
      <text>
        {cursorVisible && <span bg="#00b894" fg="#1e1e1e">{" "}</span>}
        {!cursorVisible && <span fg="#00b894">{" "}</span>}
        {placeholder && <span fg="#636e72">{` ${placeholder}`}</span>}
      </text>
    )
  }

  if (!isActive) {
    return <text fg="#b2bec3">{display}</text>
  }

  const before = display.slice(0, cursor)
  const at = cursor < display.length ? display[cursor] : ""
  const after = cursor < display.length ? display.slice(cursor + 1) : ""

  return (
    <text>
      <span fg="#dfe6e9">{before}</span>
      {at ? (
        cursorVisible
          ? <span bg="#00b894" fg="#1e1e1e">{at}</span>
          : <span fg="#dfe6e9">{at}</span>
      ) : (
        cursorVisible
          ? <span bg="#00b894" fg="#1e1e1e">{" "}</span>
          : <span>{" "}</span>
      )}
      {after && <span fg="#dfe6e9">{after}</span>}
    </text>
  )
}
