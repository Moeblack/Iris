import { computed, ref, type Ref } from 'vue'
import type { DocumentInput, ImageInput } from '../api/types'

const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_DOCUMENTS = 10
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
const SUPPORTED_DOC_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx', '.xls']
const SUPPORTED_TEXT_EXTENSIONS = [
  '.txt', '.md', '.markdown',
  '.json', '.jsonc',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.xml', '.svg', '.html', '.htm', '.csv', '.tsv', '.log',
  '.py', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.java', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.go', '.rs', '.php', '.rb',
  '.sh', '.bash', '.zsh', '.ps1',
  '.sql', '.css', '.scss', '.less', '.vue',
]
const SUPPORTED_DOC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])
const SUPPORTED_TEXT_MIMES = new Set([
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'application/ld+json',
  'application/xml',
  'image/svg+xml',
  'application/x-yaml',
  'text/yaml',
  'text/x-yaml',
  'application/toml',
  'text/x-toml',
  'application/javascript',
  'application/x-javascript',
  'application/x-sh',
  'application/x-shellscript',
  'application/sql',
])

export const SUPPORTED_UPLOAD_ACCEPT = Array.from(new Set(['image/*', ...SUPPORTED_DOC_EXTENSIONS, ...SUPPORTED_TEXT_EXTENSIONS])).join(',')

interface UseChatAttachmentsOptions {
  disabled: Ref<boolean>
  fileInputEl: Ref<HTMLInputElement | null>
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0].trim().toLowerCase()
}

function isDocumentFile(file: File): boolean {
  const normalizedMimeType = normalizeMimeType(file.type)
  if (SUPPORTED_DOC_MIMES.has(normalizedMimeType)) return true
  if (normalizedMimeType.startsWith('text/')) return true
  if (SUPPORTED_TEXT_MIMES.has(normalizedMimeType)) return true

  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
  return ext ? (SUPPORTED_DOC_EXTENSIONS.includes(ext) || SUPPORTED_TEXT_EXTENSIONS.includes(ext)) : false
}

function readFileAsImageInput(file: File): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`无法读取图片 ${file.name}`))
        return
      }
      const [, data = ''] = reader.result.split(',', 2)
      if (!data) {
        reject(new Error(`图片 ${file.name} 转码失败`))
        return
      }
      resolve({
        mimeType: file.type || 'image/png',
        data,
      })
    }
    reader.onerror = () => reject(new Error(`图片 ${file.name} 读取失败`))
    reader.readAsDataURL(file)
  })
}

function readFileAsDocumentInput(file: File): Promise<DocumentInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`无法读取文档 ${file.name}`))
        return
      }
      const [, data = ''] = reader.result.split(',', 2)
      if (!data) {
        reject(new Error(`文档 ${file.name} 转码失败`))
        return
      }
      resolve({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data,
      })
    }
    reader.onerror = () => reject(new Error(`文档 ${file.name} 读取失败`))
    reader.readAsDataURL(file)
  })
}

export function useChatAttachments(options: UseChatAttachmentsOptions) {
  const images = ref<ImageInput[]>([])
  const documents = ref<DocumentInput[]>([])
  const errorMessage = ref('')
  const attachmentsProcessing = ref(false)
  const dragActive = ref(false)

  let dragDepth = 0

  const interactionDisabled = computed(() => options.disabled.value || attachmentsProcessing.value)
  const hasAttachments = computed(() => images.value.length > 0 || documents.value.length > 0)
  const canAddMoreFiles = computed(() => images.value.length < MAX_IMAGES || documents.value.length < MAX_DOCUMENTS)
  const attachButtonLabel = computed(() => (hasAttachments.value ? '继续添加' : '上传文件'))
  const uploadHintText = computed(() => {
    if (options.disabled.value) return '当前回答完成前，附件与输入将暂时锁定。'
    if (attachmentsProcessing.value) return '正在处理附件，请稍候后再发送或继续上传。'
    return `支持拖拽 / 粘贴上传 · 图片最多 ${MAX_IMAGES} 张(5MB) · 文档/文本代码文件最多 ${MAX_DOCUMENTS} 个(50MB)`
  })
  const attachmentSummary = computed(() => {
    const parts: string[] = []
    if (images.value.length > 0) parts.push(`${images.value.length} 张图片`)
    if (documents.value.length > 0) parts.push(`${documents.value.length} 个文档`)
    return parts.join(' · ')
  })

  function setError(message: string) {
    errorMessage.value = message
  }

  function clearError() {
    errorMessage.value = ''
  }

  function toImageSrc(image: ImageInput): string {
    return `data:${image.mimeType};base64,${image.data}`
  }

  function openFilePicker() {
    if (interactionDisabled.value || !canAddMoreFiles.value) return
    options.fileInputEl.value?.click()
  }

  function clearAttachments() {
    if (interactionDisabled.value) return
    images.value = []
    documents.value = []
    clearError()
  }

  function resetAttachments() {
    images.value = []
    documents.value = []
    clearError()
  }

  function removeImage(index: number) {
    if (interactionDisabled.value) return
    images.value.splice(index, 1)
    clearError()
  }

  function removeDocument(index: number) {
    if (interactionDisabled.value) return
    documents.value.splice(index, 1)
    clearError()
  }

  async function appendFiles(files: File[]) {
    if (interactionDisabled.value || files.length === 0) return

    attachmentsProcessing.value = true

    try {
      const errors: string[] = []
      const imageFiles: File[] = []
      const docFiles: File[] = []

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          imageFiles.push(file)
        } else if (isDocumentFile(file)) {
          docFiles.push(file)
        } else {
          errors.push(`${file.name}: 不支持的文件类型`)
        }
      }

      const remainingImageSlots = MAX_IMAGES - images.value.length
      if (imageFiles.length > 0 && remainingImageSlots <= 0) {
        errors.push(`图片已达上限 ${MAX_IMAGES} 张`)
      }
      const candidateImages = imageFiles.slice(0, Math.max(0, remainingImageSlots))
      if (imageFiles.length > remainingImageSlots && remainingImageSlots > 0) {
        errors.push(`图片最多上传 ${MAX_IMAGES} 张`)
      }
      const validImages = candidateImages.filter((file) => {
        if (file.size > MAX_IMAGE_BYTES) {
          errors.push(`${file.name} 超过 5MB 限制`)
          return false
        }
        return true
      })

      const remainingDocSlots = MAX_DOCUMENTS - documents.value.length
      if (docFiles.length > 0 && remainingDocSlots <= 0) {
        errors.push(`文档已达上限 ${MAX_DOCUMENTS} 个`)
      }
      const candidateDocs = docFiles.slice(0, Math.max(0, remainingDocSlots))
      if (docFiles.length > remainingDocSlots && remainingDocSlots > 0) {
        errors.push(`文档最多上传 ${MAX_DOCUMENTS} 个`)
      }
      const validDocs = candidateDocs.filter((file) => {
        if (file.size > MAX_DOCUMENT_BYTES) {
          errors.push(`${file.name} 超过 50MB 限制`)
          return false
        }
        return true
      })

      if (validImages.length === 0 && validDocs.length === 0) {
        setError(errors[0] ?? '没有可用的文件')
      } else {
        try {
          const [newImages, newDocs] = await Promise.all([
            Promise.all(validImages.map(readFileAsImageInput)),
            Promise.all(validDocs.map(readFileAsDocumentInput)),
          ])
          images.value = [...images.value, ...newImages]
          documents.value = [...documents.value, ...newDocs]
          if (errors.length > 0) {
            setError(errors.join('；'))
          } else {
            clearError()
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          setError(detail)
        }
      }
    } finally {
      attachmentsProcessing.value = false
    }
  }

  async function handleFileSelection(event: Event) {
    const target = event.target as HTMLInputElement
    const files = Array.from(target.files ?? [])
    await appendFiles(files)
    target.value = ''
  }

  function handleDragEnter(event: DragEvent) {
    if (interactionDisabled.value || !event.dataTransfer?.types.includes('Files')) return
    dragDepth += 1
    dragActive.value = true
  }

  function handleDragOver(event: DragEvent) {
    if (interactionDisabled.value || !event.dataTransfer?.types.includes('Files')) return
    dragActive.value = true
  }

  function handleDragLeave(event: DragEvent) {
    if (interactionDisabled.value || !event.dataTransfer?.types.includes('Files')) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) {
      dragActive.value = false
    }
  }

  async function handleDrop(event: DragEvent) {
    dragDepth = 0
    dragActive.value = false
    if (interactionDisabled.value) return
    const files = Array.from(event.dataTransfer?.files ?? [])
    await appendFiles(files)
  }

  async function handlePaste(event: ClipboardEvent) {
    if (interactionDisabled.value) return
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File)

    if (imageFiles.length === 0) return

    event.preventDefault()
    await appendFiles(imageFiles)
  }

  function buildOutgoingImages(): ImageInput[] {
    return images.value.map((image) => ({
      mimeType: image.mimeType,
      data: image.data,
    }))
  }

  function buildOutgoingDocuments(): DocumentInput[] {
    return documents.value.map((doc) => ({
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      data: doc.data,
    }))
  }

  return {
    images,
    documents,
    errorMessage,
    attachmentsProcessing,
    dragActive,
    interactionDisabled,
    hasAttachments,
    canAddMoreFiles,
    attachButtonLabel,
    uploadHintText,
    attachmentSummary,
    clearError,
    toImageSrc,
    openFilePicker,
    clearAttachments,
    resetAttachments,
    removeImage,
    removeDocument,
    handleFileSelection,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    buildOutgoingImages,
    buildOutgoingDocuments,
  }
}
