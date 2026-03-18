import io
from src.logger import LOGGER
import traceback
import PyPDF2
# import newrelic.agent
import json


# @newrelic.agent.background_task()
def process_pdf_data(job_id, pdf_data):
    try:
        LOGGER.info(f"Processando job {job_id}")
        total_response = 0
        file = io.BytesIO(pdf_data)
        reader = PyPDF2.PdfReader(file)
        for page in reader.pages:
            total_response += len(page.extract_text())
        return {"jobId": job_id, "charCount": total_response, "message": "SUCESSO"}
    except Exception:
        formatted_exc = traceback.format_exc()
        LOGGER.error(formatted_exc)
        print(f"Erro no processamento do job {job_id}: {formatted_exc}")
        return {"jobId": job_id, "charCount": 0, "message": "ERRO"}


def parse_header(header):
    parts = header.split('#')
    if len(parts) >= 2 and parts[0] == "BEGIN":
        return int(parts[1])
    return None


def read_file_connection(connection, executor):
    def handle_connection():
        try:
            buffer = b""
            job_id = None
            processing_started = False
            print("Aguardando dados do PDF...")

            while True:
                chunk = connection.recv(4096)
                if not chunk:
                    print(f"Conexão encerrada prematuramente.")
                    connection.close()
                    return
                
                buffer += chunk

                if not processing_started and b'##' in buffer:
                    header_part, _, buffer = buffer.partition(b'##')
                    job_id = parse_header(header_part.decode("utf-8"))
                    processing_started = True
                    print(f"Processando job {job_id}")

                if b"#END_OF_TRANSMISSION#" in buffer:
                    print(f"Finalizando processamento do job {job_id}")
                    buffer, _ = buffer.split(b"#END_OF_TRANSMISSION#", 1)
                    break
            executor.submit(accept_connection(job_id, buffer, connection))
            print(f"Job {job_id} adicionado à fila de processamento.")
        except Exception:
            formatted_exc = traceback.format_exc()
            LOGGER.error(formatted_exc)
            connection.close()
    return handle_connection


def accept_connection(job_id, buffer, connection):
    def handle_connection():
        try: 
            processed_result = process_pdf_data(job_id, buffer)
            print(f"Resultado do processamento do job {job_id}: {processed_result}")
            connection.sendall(json.dumps(processed_result).encode("utf-8"))
            print(f"Job {job_id} finalizado e resposta enviada.")
        except Exception:
            formatted_exc = traceback.format_exc()
            LOGGER.error(formatted_exc)
        finally:
            connection.close()

    return handle_connection
