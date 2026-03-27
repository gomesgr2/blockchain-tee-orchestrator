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

# Obter o dado de fallback do 100 RPS em 5mb
df_fallback = df[(df['type'] == 'blockchain_fallback') & (df['rps'] == '100 RPS') & (df['file'] == '5mb')]
fallback_val = df_fallback['avg_latency_s'].values[0]

custom_ticks = [1, 10, 100, 1024, 5120]
custom_labels = ['1kb', '10kb', '100kb', '1mb', '5mb']

plt.figure(figsize=(10, 7))

rps_levels = ['1 RPS', '10 RPS', '50 RPS', '100 RPS']
markers = ['o', 'v', 's', 'd']

for rps, marker in zip(rps_levels, markers):
    data = df_local[df_local['rps'] == rps].sort_values('size_num')
    line, = plt.plot(data['size_num'], data['avg_latency_s'], marker=marker, label=rps, linewidth=1.5, markersize=6)
    
    if rps == '100 RPS':
        x_last_valid = 1024
        y_last_valid = data[data['size_num'] == x_last_valid]['avg_latency_s'].values[0]
        
        # Cria a "Linha Fantasma" ligando o último momento de sucesso TEE com o momento de sucesso Blockchain
        color = line.get_color()
        plt.plot([x_last_valid, 5120], [y_last_valid, fallback_val], linestyle=':', color=color, linewidth=2, alpha=0.8)
        
        # Marcador Oco/Vazado indicando mudança de plataforma (do local para blockchain)
        plt.plot(5120, fallback_val, marker='o', mfc='none', mec='darkred', markersize=10, mew=2, linestyle='None')
        
        # Alerta descritivo apontando pro nó de blockchain
        plt.annotate(f"Repassado para a Blockchain\n(Latência real: {fallback_val:.2f}s)", 
             xy=(5120, fallback_val), xytext=(100, fallback_val + 8),
             arrowprops=dict(facecolor='darkred', arrowstyle="->", color='darkred', lw=1.5),
             fontsize=10, color='darkred', weight='bold',
             bbox=dict(boxstyle="round,pad=0.3", fc="#fff0f0", ec="darkred", lw=1))

plt.xscale('log')
plt.xticks(custom_ticks, custom_labels, rotation=45)
plt.xlabel('Tamanho do Arquivo (escala logarítmica)')
plt.ylabel('Tempo Médio Real Percebido Pelo Cliente (s)')
plt.title('Tempo médio da Arquitetura Híbrida (Linha Fantasma de Roteamento Fallback)')
plt.grid(True, which="both", ls="--", alpha=0.5)

# Correção da legenda manual
handles, labels = plt.gca().get_legend_handles_labels()
fallback_entry = mlines.Line2D([], [], color='gray', marker='o', mfc='none', mec='darkred', linestyle=':', markersize=9, mew=2, label='Exaustão de TEE -> Transferido p/ Smart Contract')
handles.append(fallback_entry)
labels.append('Exaustão TEE -> Smart Contract')

plt.legend(handles=handles, labels=labels, title='Taxa RPS & Transições', loc='upper left')

plt.tight_layout()
plt.savefig('grafico_alt4_linha_fantasma.png', dpi=300)
plt.close()
print("Gráfico Alt 4 de Linha Fantasma gerado com sucesso!")
