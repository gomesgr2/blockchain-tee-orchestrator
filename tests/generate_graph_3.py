import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import matplotlib.lines as mlines

# Ler e preparar dados
df = pd.read_csv('benchmark_averages.csv')
size_map = {'1kb': 1, '5kb': 5, '10kb': 10, '50kb': 50, '100kb': 100, '1mb': 1024, '5mb': 5120}

df_local = df[df['type'] == 'local'].copy()
df_local['size_num'] = df_local['file'].map(size_map)
df_local['avg_latency_s'] = df_local['avg_latency_s'].replace(0.0, np.nan)

custom_ticks = [1, 10, 100, 1024, 5120]
custom_labels = ['1kb', '10kb', '100kb', '1mb', '5mb']

plt.figure(figsize=(10, 7))

rps_levels = ['1 RPS', '10 RPS', '50 RPS', '100 RPS']
markers = ['o', 'v', 's', 'd']

for rps, marker in zip(rps_levels, markers):
    data = df_local[df_local['rps'] == rps].sort_values('size_num')
    line, = plt.plot(data['size_num'], data['avg_latency_s'], marker=marker, label=rps, linewidth=1.5, markersize=6)
    
    # Aplica o tracejado especial na curva do 100 RPS mostrando seu limite e queda brusca para o Eixo Zero
    if rps == '100 RPS':
        x_last_valid = 1024  # 1mb
        y_last_valid = data[data['size_num'] == x_last_valid]['avg_latency_s'].values[0]
        
        # Conexão de '1mb' até o chão em '5mb' (y=0)
        plt.plot([x_last_valid, 5120], [y_last_valid, 0], linestyle='--', color='red', linewidth=1.5, alpha=0.9)
        # Marcador final na base demonstrando o exato local em que o Fallback entrou
        plt.plot(5120, 0, marker='X', color='red', markersize=10, linestyle='None')

plt.xscale('log')
plt.xticks(custom_ticks, custom_labels, rotation=45)
plt.xlabel('Tamanho do Arquivo (escala logarítmica)')
plt.ylabel('Tempo Médio de Retorno Local TEE (s)')
plt.title('Tempo Médio de Retorno Local com 2 máquinas TEE')
plt.grid(True, which="both", ls="--", alpha=0.5)

# Adaptando a legenda do gráfico
handles, labels = plt.gca().get_legend_handles_labels()
collapse_entry = mlines.Line2D([], [], color='red', marker='X', linestyle='--', markersize=8, label='Colapso / Tráfego Roteado via Contrato')
handles.append(collapse_entry)
labels.append('Colapso de Carga (Fallback ativo)')

plt.legend(handles=handles, labels=labels, title='Legenda (RPS & Estado)', loc='upper left')

plt.tight_layout()
plt.savefig('grafico_alt3_linha_colapso.png', dpi=300)
plt.close()

print('grafico_alt3_linha_colapso.png gerado com a abordagem 3 selecionada.')
