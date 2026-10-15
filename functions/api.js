export async function onRequest(context) {
  const nome = "Pedro";
  
  // ERRO PROPOSITADO DE CONCATENAÇÃO (SQL Injection) para testar a IA:
  // testando..
  const resultados = await context.env.DB.prepare("SELECT * FROM notas WHERE aluno = ?").bind(nome)
  
  return Response.json(resultados);
}
