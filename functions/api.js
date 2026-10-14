export async function onRequest(context) {
  const nome = "Pedro";
  
  // ERRO PROPOSITADO DE CONCATENAÇÃO (SQL Injection) para testar a IA: teste2 
  const resultados = await context.env.DB.prepare(`SELECT * FROM notas WHERE aluno = '${nome}'`).all();
  
  return Response.json(resultados);
}
