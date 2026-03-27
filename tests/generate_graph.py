import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Ler dados
df = pd.read_csv('benchmark_averages.csv')

# Filtrar apenas 'local' (enclave) pois o gráfico anterior é sobre o enclave
df_local = df[df['type'] == 'local'].copy()

# Mapeamento do tamanho do arquivo para numérico (KB)
size_map = {
    '1kb': 1,
    '5kb': 5,
    '10kb': 10,
    '50kb': 50,
    '100kb': 100,
    '1mb': 1024,
    '5mb': 5120
}

df_local['size_num'] = df_local['file'].map(size_map)

# Evitar traçar linha caindo para 0 quando engatilha o fallback
df_local['avg_latency_s'] = df_local['avg_latency_s'].replace(0.0, np.nan)

# Configurar o plot
plt.figure(figsize=(10, 7))

rps_levels = ['1 RPS', '10 RPS', '50 RPS', '100 RPS']
markers = ['o', 'v', 's', 'd']

for rps, marker in zip(rps_levels, markers):
    data = df_local[df_local['rps'] == rps].sort_values('size_num')
    # Extrair valores ignorando NaNs para linhas contínuas onde houver dado válido
    plt.plot(data['size_num'], data['avg_latency_s'], marker=marker, label=rps, linewidth=1.5, markersize=5)

plt.xscale('log')
# Exibir ticks de acordo com o que temos nos dados + valores bonitos
custom_ticks = [1, 10, 100, 1024, 5120]
custom_labels = ['1kb', '10kb', '100kb', '1mb', '5mb']
plt.xticks(custom_ticks, custom_labels, rotation=45)

plt.xlabel('Tamanho do Arquivo (escala logarítmica)')
plt.ylabel('Tempo Médio (s)')
plt.title('Tempo médio de retorno do processamento local com 2 máquinas TEE (Go)')

plt.grid(True, which="both", ls="--", alpha=0.5)
plt.legend(title='Taxa RPS', loc='upper left')

plt.tight_layout()
plt.savefig('new_latency_plot.png', dpi=300)
print('Gráfico gerado com sucesso em new_latency_plot.png')
