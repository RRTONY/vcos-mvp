'use client'

import { useRef, useEffect } from 'react'
import { FiBold, FiItalic, FiUnderline, FiList, FiLink } from 'react-icons/fi'
import { MdFormatListNumbered } from 'react-icons/md'

function ToolbarBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the text selection alive when clicking the toolbar
      onClick={onClick}
      title={title}
      className="w-6 h-6 flex items-center justify-center text-ink3 hover:bg-sand3 hover:text-ink rounded transition-colors"
    >
      {children}
    </button>
  )
}

/**
 * Lightweight rich-text field (bold/italic/underline/lists/links) built on
 * contentEditable + execCommand — no external editor dependency. Value is a
 * sanitized-on-write HTML string; the parent owns state (controlled).
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minRows = 4,
  disabled = false,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minRows?: number
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const focused = useRef(false)

  // Sync external value changes (e.g. loading an existing submission) without
  // clobbering the cursor while the user is actively typing in this field.
  useEffect(() => {
    if (!ref.current || focused.current) return
    if (ref.current.innerHTML !== (value || '')) ref.current.innerHTML = value || ''
  }, [value])

  function handleInput() {
    onChange(ref.current?.innerHTML ?? '')
  }

  function exec(cmd: string, arg?: string) {
    if (disabled) return
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    handleInput()
  }

  function handleLink() {
    const url = window.prompt('Link URL')
    if (!url) return
    exec('createLink', /^https?:\/\//i.test(url) ? url : `https://${url}`)
  }

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>'

  return (
    <div className={`border border-sand4 rounded-lg overflow-hidden ${disabled ? 'opacity-60' : 'focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent'} transition-colors`}>
      {!disabled && (
        <div className="flex items-center gap-0.5 border-b border-sand3 px-1.5 py-1 bg-sand2/60">
          <ToolbarBtn onClick={() => exec('bold')} title="Bold"><FiBold className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onClick={() => exec('italic')} title="Italic"><FiItalic className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onClick={() => exec('underline')} title="Underline"><FiUnderline className="w-3.5 h-3.5" /></ToolbarBtn>
          <div className="w-px h-4 bg-sand3 mx-1" />
          <ToolbarBtn onClick={() => exec('insertUnorderedList')} title="Bullet list"><FiList className="w-3.5 h-3.5" /></ToolbarBtn>
          <ToolbarBtn onClick={() => exec('insertOrderedList')} title="Numbered list"><MdFormatListNumbered className="w-3.5 h-3.5" /></ToolbarBtn>
          <div className="w-px h-4 bg-sand3 mx-1" />
          <ToolbarBtn onClick={handleLink} title="Insert link"><FiLink className="w-3.5 h-3.5" /></ToolbarBtn>
        </div>
      )}
      <div className="relative">
        {isEmpty && placeholder && (
          <div className="absolute top-2.5 left-3 text-sm text-ink4 pointer-events-none">{placeholder}</div>
        )}
        <div
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={() => { focused.current = true }}
          onBlur={() => { focused.current = false }}
          style={{ minHeight: `${minRows * 1.5}rem` }}
          className="w-full bg-sand px-3 py-2.5 text-sm leading-relaxed focus:outline-none
            [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
            [&_a]:text-accent [&_a]:underline"
        />
      </div>
    </div>
  )
}
