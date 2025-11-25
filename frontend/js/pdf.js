// frontend/js/pdf.js
import { showToast, closeModal } from './utils.js';

export function generateTermoPdf(formElement, originalEquipamentos, responsavel) {
    // Coleta os dados do formulário mesclando com os dados originais
    const equipamentosCompletos = originalEquipamentos.map(item => {
        const id = item.id;
        // Pega os checkboxes marcados
        const acessorios = Array.from(formElement.querySelectorAll(`input[name="acessorios_${id}"]:checked`))
            .map(el => el.value);
            
        return {
            ...item,
            processador: formElement.querySelector(`input[name="processador_${id}"]`).value || '________________',
            memoria: formElement.querySelector(`input[name="memoria_${id}"]`).value || '________________',
            disco: formElement.querySelector(`input[name="disco_${id}"]`).value || '________________',
            sistema_operacional: formElement.querySelector(`input[name="so_${id}"]`).value || '________________',
            estado: formElement.querySelector(`input[name="estado_${item.id}"]:checked`)?.value || 'Novo',
            acessorios: acessorios
        };
    });

    const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const dataLocal = `Montenegro, ${dataExtenso}`;

    const createCheckbox = (label, checked) => `(${checked ? 'X' : '&nbsp;'}) ${label}<br>`;

    // Template HTML do PDF
    const contentHtml = `
        <div id="pdf-content-inner" style="font-family: Arial, sans-serif; color: #333; font-size: 10pt; line-height: 1.5;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="font-size: 14pt; margin: 0;">TERMO DE RECEBIMENTO E RESPONSABILIDADE</h1>
                <h2 style="font-size: 12pt; font-weight: normal; margin: 0;">PELO USO E GUARDA DE EQUIPAMENTOS</h2>
            </div>
            <p style="text-align: justify; margin-bottom: 20px;">
                A <strong>SYONET INFORMÁTICA LTDA.</strong>, pessoa jurídica de direito privado, inscrita no CNPJ n° 05.960.589/0001-93, com sede na Rua Buarque de Macedo, n° 93, Bairro Centro, CEP 92510-300, em Montenegro, Rio Grande do Sul, entrega neste ato, os equipamentos descritos abaixo:
            </p>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9pt;">
                ${equipamentosCompletos.map(item => `
                    <tr style="page-break-inside: avoid;">
                        <td style="border: 1px solid #000; padding: 10px; width: 100%; vertical-align: top;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="width: 50%; vertical-align: top; padding-right: 10px;">
                                        <strong>Tipo de equipamento:</strong><br>
                                        ${createCheckbox('Notebook', item.nome.toLowerCase().includes('notebook'))}
                                        ${createCheckbox('Desktop', item.nome.toLowerCase().includes('desktop'))}
                                        ${createCheckbox('Outros: ' + (!item.nome.toLowerCase().includes('notebook') && !item.nome.toLowerCase().includes('desktop') ? item.nome : ''), !item.nome.toLowerCase().includes('notebook') && !item.nome.toLowerCase().includes('desktop'))}
                                        <br>
                                        <strong>Dados do equipamento:</strong><br>
                                        Marca/Modelo: ${item.marca || ''} ${item.modelo || ''}<br>
                                        Nº de Série: ${item.numero_serie || ''}<br>
                                        Nº Patrimônio: ${item.patrimonio || ''}<br>
                                        <br>
                                        <strong>Equipamento:</strong><br>
                                        ${createCheckbox('Novo', item.estado === 'Novo')}
                                        ${createCheckbox('Usado', item.estado === 'Usado')}
                                    </td>
                                    <td style="width: 50%; vertical-align: top; border-left: 1px solid #ccc; padding-left: 10px;">
                                        <strong>Características:</strong><br>
                                        Processador: ${item.processador}<br>
                                        Memória: ${item.memoria}<br>
                                        Disco: ${item.disco}<br>
                                        <br>
                                        <strong>Softwares instalados:</strong><br>
                                        Sistema Operacional: ${item.sistema_operacional}<br>
                                        <br>
                                        <strong>Acessórios:</strong><br>
                                        ${createCheckbox('Fonte de alimentação', item.acessorios.includes('Fonte de alimentação'))}
                                        ${createCheckbox('Headset', item.acessorios.includes('Headset'))}
                                        ${createCheckbox('Mouse', item.acessorios.includes('Mouse'))}
                                        ${createCheckbox('Teclado', item.acessorios.includes('Teclado'))}
                                        ${createCheckbox('Monitor', item.acessorios.includes('Monitor'))}
                                        ${createCheckbox('Cabo HDMI/VGA', item.acessorios.includes('Cabo HDMI/VGA'))}
                                        ${createCheckbox('Webcam', item.acessorios.includes('Webcam'))}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                `).join('')}
            </table>

            <div style="page-break-before: always;">
                <p style="text-align: justify; margin-bottom: 10px;">
                    Declaro-me ciente das condições abaixo, ao passo que comprometo-me a manter os equipamentos e acessórios acima descritos sob minha responsabilidade e em perfeito estado de conservação, sendo que:
                </p>
                
                <ul style="margin: 0 0 15px 0; padding-left: 20px; list-style-type: none; font-size: 9pt;">
                    <li style="margin-bottom: 5px;">• Em situações de roubo, furto ou extravio deverei informar imediatamente à Diretoria direta e providenciar boletim de ocorrência policial e encaminhamento do mesmo à superior;</li>
                    <li style="margin-bottom: 5px;">• O equipamento citado é cedido à título de empréstimo, sendo de propriedade da Syonet;</li>
                    <li style="margin-bottom: 5px;">• Em casos de danos no equipamento, deverei notificar a Syonet, que avaliará o dano. Estou ciente de que, dependendo do dano, farei reembolso para a Syonet dos valores para conserto e/ou aquisição de novo equipamento;</li>
                    <li style="margin-bottom: 5px;">• Em caso de desligamento, o equipamento deverá ser devolvido à Syonet em perfeito estado de conservação, considerando o tempo de uso;</li>
                    <li style="margin-bottom: 5px;">• Nenhuma alteração no hardware do equipamento poderá ser realizada sem o envolvimento da Syonet;</li>
                    <li style="margin-bottom: 5px;">• Declaro que estou ciente que o incumprimento do presente Termo poderá gerar as consequências cabíveis.</li>
                </ul>
                
                <div style="margin-top: 50px; text-align: center;">
                    <div style="display: inline-block; text-align: center; width: 300px;">
                        <p style="margin: 0; padding: 0;">_________________________________________</p>
                        <p style="margin: 5px 0 0 0; padding: 0;"><strong>${responsavel.nome}</strong></p>
                    </div>
                </div>

                <div style="margin-top: 30px; text-align: center;">
                    <p style="margin: 0; padding: 0;">${dataLocal}</p>
                </div>
            </div>

            <div style="page-break-before: always; border: 1px solid #000; padding: 20px; margin-top: 40px;">
                    <h2 style="text-align: center; font-size: 14pt; margin-bottom: 20px;">TERMO DE DEVOLUÇÃO</h2>
                    <p>Atestamos que o(s) equipamento(s) foi(ram) devolvido(s), nas seguintes condições:</p>
                    <div style="margin-top: 20px; line-height: 2;">
                        <p>( &nbsp; ) Em perfeito estado.</p>
                        <p>( &nbsp; ) Apresentando defeito.</p>
                        <p>( &nbsp; ) Faltando peças ou acessórios.</p>
                    </div>
                    <p style="margin-top: 20px;">Descrever defeito e/ou citar as peças/acessórios faltantes:</p>
                    <div style="height: 100px; border-bottom: 1px solid #ccc;"></div>
                    <div style="margin-top: 60px;">
                        <p><strong>Data da Devolução:</strong> ____/____/________</p>
                        <div style="margin-top: 40px; text-align: center;">
                            <div style="display: inline-block; text-align: center; width: 300px;">
                                <p style="margin: 0; padding: 0;">_________________________________________</p>
                                <p style="margin: 5px 0 0 0; padding: 0;">Assinatura do Responsável (Syonet)</p>
                            </div>
                        </div>
                    </div>
            </div>

        </div>
    `;

    // Injeta o HTML em um container invisível para o html2pdf ler
    document.getElementById('pdf-template-container').innerHTML = contentHtml;
    const element = document.getElementById('pdf-content-inner');
    
    const opt = {
        margin: 15,
        filename: `Termo_Responsabilidade_${responsavel.nome.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Usa a biblioteca global html2pdf
    window.html2pdf().set(opt).from(element).save();
    
    closeModal('termoDataModal');
    showToast('PDF gerado com sucesso!', 'success');
}