import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'
import Icon from '../../../components/ui/Icon'

interface Props {
  value: string
  onChange: (html: string) => void
  variables: { id: string; name: string }[]
  fieldTokens: { token: string; label: string }[]
}

export default function EndScreenMessageEditor({ value, onChange, variables, fieldTokens }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Scrivi il messaggio finale…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none min-h-[120px] px-3 py-2 text-[#1a1b22]',
      },
    },
  })

  // Sync only when value changes from outside (e.g. store load)
  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '')
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  function insertToken(token: string) {
    if (!editor) return
    editor.chain().focus().insertContent(token).run()
  }

  if (!editor) return null

  return (
    <div className="rounded-lg border border-[#c4c5d5] bg-[#f4f3fc] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#c4c5d5] bg-white flex-wrap">
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Titolo"
        >
          <span className="text-xs font-black">H</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Grassetto"
        >
          <Icon name="format_bold" size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Corsivo"
        >
          <Icon name="format_italic" size={16} />
        </ToolbarButton>

        <div className="w-px h-5 bg-[#c4c5d5] mx-1" />

        <ToolbarButton
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="Allinea a sinistra"
        >
          <Icon name="format_align_left" size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="Centra"
        >
          <Icon name="format_align_center" size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="Allinea a destra"
        >
          <Icon name="format_align_right" size={16} />
        </ToolbarButton>

        <div className="w-px h-5 bg-[#c4c5d5] mx-1" />

        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          title="Rimuovi formattazione"
        >
          <Icon name="format_clear" size={16} />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />

      {/* Variable chips */}
      {(variables.length > 0 || fieldTokens.length > 0) && (
        <div className="border-t border-[#c4c5d5] px-2 py-2 bg-white flex flex-wrap gap-1.5">
          <span className="text-xs text-[#747684] self-center mr-1">Inserisci:</span>
          {variables.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => insertToken(`{{${v.name}}}`)}
              className="text-xs px-2 py-0.5 bg-[#dce1ff] text-[#002068] rounded font-mono hover:bg-[#b5c4ff] transition-colors"
            >
              {`{{${v.name}}}`}
            </button>
          ))}
          {fieldTokens.map(({ token, label }) => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="text-xs px-2 py-0.5 bg-[#f4f3fc] text-[#444653] rounded font-mono hover:bg-[#e8e7f0] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  active, onClick, title, children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
        active ? 'bg-[#002068] text-white' : 'text-[#444653] hover:bg-[#f4f3fc]'
      }`}
    >
      {children}
    </button>
  )
}
