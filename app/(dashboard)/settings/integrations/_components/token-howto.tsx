import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function TokenHowto() {
  return (
    <Accordion>
      <AccordionItem value="howto">
        <AccordionTrigger>Como gerar o System User token?</AccordionTrigger>
        <AccordionContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Crie um Meta App em developers.facebook.com/apps (tipo Business).</li>
            <li>Adicione o produto Marketing API ao app.</li>
            <li>No Business Manager → Settings → System Users, crie um novo (role Employee).</li>
            <li>Atribua as ad accounts ao System User com permissão View performance (read-only).</li>
            <li>Atribua o app criado ao System User com permissão Develop app.</li>
            <li>Generate New Token → permissões: <code>ads_read</code> + <code>business_management</code>. Token Expiration: Never.</li>
            <li>Cole o token no env var <code>META_SYSTEM_USER_TOKEN</code> da Vercel (Production + Preview + Development).</li>
            <li>Recarregue esta página — o status deve ficar verde.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Detalhes completos no spec: <code>docs/superpowers/specs/2026-05-06-meta-ads-integration-design.md</code>.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
