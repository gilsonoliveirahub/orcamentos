'use client'

import { useCallback, useRef, useState } from 'react'

// P4 (2026-09-19): ditado por voz — só usado no campo final de descrição
// ("notas"), nunca noutro campo. Converte voz em texto EDITÁVEL (o
// resultado só atualiza o mesmo estado do textarea, através de `onResult`
// — nunca chama nenhuma função de envio). O chamador decide o que fazer com
// o texto; este hook nunca submete nada sozinho.
//
// API Web Speech nativa do browser (SpeechRecognition/webkitSpeechRecognition)
// — sem serviço externo novo. Deteção de suporte explícita: em browsers sem
// suporte (ex: Firefox desktop, alguns Safari), `supported` fica `false` e
// quem usa o hook deve simplesmente não mostrar o botão do microfone — o
// campo de texto continua a funcionar normalmente por escrita.
export function useDictation(onResult: (text: string) => void) {
  const recognitionRef = useRef<any>(null)
  const [listening, setListening] = useState(false)
  const supported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  // `seed`: texto já existente no campo antes de começar a ditar — o novo
  // texto é ACRESCENTADO a seguir, nunca substitui o que o cliente já tinha
  // escrito à mão.
  const toggle = useCallback((seed: string = '') => {
    if (!supported) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'pt-PT'
    recognition.continuous = true
    recognition.interimResults = true

    let finalText = seed ? `${seed} ` : ''
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript as string
        if (event.results[i].isFinal) finalText += `${transcript} `
        else interim += transcript
      }
      onResult((finalText + interim).trim())
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening, supported, onResult])

  return { supported, listening, toggle }
}
