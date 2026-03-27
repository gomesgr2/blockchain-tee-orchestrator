package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"runtime/debug"
	"github.com/ledongthuc/pdf"
)

type ProcessResponse struct {
	JobID     int    `json:"jobId"`
	CharCount int    `json:"charCount"`
	Message   string `json:"message"`
}

func main() {
	port := "9090"
	listener, err := net.Listen("tcp", "0.0.0.0:"+port)
	if err != nil {
		log.Fatalf("Erro ao iniciar servidor TCP na porta %s: %v", port, err)
	}
	defer listener.Close()

	log.Printf("[TEE_GO] Servidor nativo iniciado e escutando conexões na porta %s\n", port)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Erro ao aceitar a conexão: %v\n", err)
			continue
		}

		go handleConnection(conn)
	}
}

func handleConnection(conn net.Conn) {
	defer conn.Close()
	
	// Recover in case of panic
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic recovered no job handler: %v\n", r)
			log.Printf("Stack: %s\n", debug.Stack())
		}
	}()

	var buffer bytes.Buffer
	tmp := make([]byte, 4096)
	var jobID int = -1
	processingStarted := false

	// Define um timeout de leitura na rede se não enviar dados há mto tempo
	// conn.SetReadDeadline(time.Now().Add(5 * time.Minute))

	for {
		n, err := conn.Read(tmp)
		if n > 0 {
			buffer.Write(tmp[:n])
		}

		b := buffer.Bytes()

		if !processingStarted {
			// Procura pelo demarcador do Header, conforme código python: b'##'
			idxTokens := bytes.Index(b, []byte("##"))
			if idxTokens != -1 {
				headerPart := string(b[:idxTokens])
				// A frente do demarcador '##'
				remainingParts := b[idxTokens+2:]

				if strings.HasPrefix(headerPart, "BEGIN#") {
					idStr := strings.TrimPrefix(headerPart, "BEGIN#")
					if id, parseErr := strconv.Atoi(idStr); parseErr == nil {
						jobID = id
						processingStarted = true
						log.Printf("[REQ] Processando job %d...", jobID)
					}
				}

				// Atualiza o buffer com o resto (o inicio real do PDF em Bytes)
				buffer.Reset()
				buffer.Write(remainingParts)
			}
		}

		// Checa se encontrou a string final de transmissão e finaliza o stream de leitura
		idxEnd := bytes.Index(buffer.Bytes(), []byte("#END_OF_TRANSMISSION#"))
		if idxEnd != -1 {
			// Encontrou o final, remova-o do buffer final de PDF
			pdfBytes := buffer.Bytes()[:idxEnd]
			buffer.Reset()
			buffer.Write(pdfBytes)
			log.Printf("[REQ] Fim da Transmissão TCP do job %d detectada.", jobID)
			break
		}

		if err != nil {
			if err != io.EOF {
				log.Printf("[REQ] Erro ao ler TCP do cliente: %v", err)
			}
			break
		}
	}

	if !processingStarted {
		log.Println("[REQ] EOF antes/sem enviar Header (#BEGIN) válido. Fechando.")
		return
	}

	pdfData := buffer.Bytes()
	log.Printf("[REQ] Job %d: Bytes extraídos (%d bytes)\n", jobID, len(pdfData))

	var totalChars int
	msg := "SUCESSO"

	// Protege contra PDF's muito pequenos ou corrompidos via network stream
	if len(pdfData) < 100 {
	    log.Printf("[REQ] Job %d: Buffer de arquivo muito pequeno, assumindo falha/vazio.\n", jobID)	
		msg = "ERRO"
	} else {
		count, processErr := processPDF(pdfData)
		if processErr != nil {
			log.Printf("[REQ] Erro do PyMuPDF_GO ao processar Job %d: %v\n", jobID, processErr)
			msg = "ERRO"
			totalChars = 0
		} else {
			totalChars = count
		}
	}

	resp := ProcessResponse{
		JobID:     jobID,
		CharCount: totalChars,
		Message:   msg,
	}

	respJSON, err := json.Marshal(resp)
	if err != nil {
		log.Printf("[REQ] Erro serializando JSON Job %d: %v\n", jobID, err)
		return
	}

	_, err = conn.Write(respJSON)
	if err != nil {
		log.Printf("[REQ] Erro ao enviar os resultados do Job %d ao TM: %v\n", jobID, err)
	} else {
		log.Printf("[REQ] Job %d finalizado. CharCount -> %d. Socket fechado.\n", jobID, totalChars)
	}
}

// processPDF usa biblioteca de C-bindings/Go-natives internamente
func processPDF(data []byte) (int, error) {
	reader := bytes.NewReader(data)
	
	// A new reader that uses bytes buffer io.ReaderAt and its length
	pdfReader, err := pdf.NewReader(reader, int64(len(data)))
	if err != nil {
		return 0, fmt.Errorf("pdf open error: %w", err)
	}

	numPages := pdfReader.NumPage()
	totalChars := 0

    // Usa um WaitGroup pra contar os bytes das paginas paralelamente!
	var mu sync.Mutex
	var wg sync.WaitGroup

	for i := 1; i <= numPages; i++ {
		wg.Add(1)
		
		go func(pageNum int) {
			defer wg.Done()
			
			// Defer recover prevent go-routines panics from crashing server
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Panic recovering from PDF page %d\n", pageNum)
				}
			}()

			page := pdfReader.Page(pageNum)
			if page.V.IsNull() {
				return
			}
			
			text, err := page.GetPlainText(nil)
			if err != nil {
				return
			}
			
			mu.Lock()
			totalChars += len(text)
			mu.Unlock()
			
		}(i)
	}

	wg.Wait()
	return totalChars, nil
}
