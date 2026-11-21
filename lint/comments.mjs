const DIRECTIVE = /^\/?\s*(@ts-expect-error\b|<reference\b|realtime-allow:|@vitest-environment\b|oxlint-disable|eslint-disable)/;
const DECISION = /^\s*Decision:/;
const PUBLISHED = /typescript\/packages\/[^/]+\/src\//;
const DECLARATION = /^(Export|TSTypeAliasDeclaration$|TSInterfaceDeclaration$|TSModuleDeclaration$)/;

const noComments = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Bans comments except decision records, tool directives and JSDoc on the published API.' },
    messages: {
      banned:
        'Delete this comment. If it records a non-obvious decision, start it with "Decision:". JSDoc is allowed only on the published API in typescript/packages/*/src. See .claude/skills/delete-comment.',
    },
    schema: [],
  },
  create(context) {
    const filename = (context.physicalFilename ?? context.filename).replaceAll('\\', '/');
    const published = PUBLISHED.test(filename);
    return {
      Program(program) {
        const statementFor = (comment) =>
          program.body.find((s) => s.range[0] <= comment.range[0] && s.range[1] >= comment.range[1]) ??
          program.body.find((s) => s.range[0] >= comment.range[1]);
        let chainEnd = -1;
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang' || context.sourceCode.text.startsWith('#!', comment.range[0])) continue;
          const line = comment.type === 'Line';
          if (line && DIRECTIVE.test(comment.value)) continue;
          if (line && DECISION.test(comment.value)) { chainEnd = comment.loc.end.line; continue; }
          const { text } = context.sourceCode;
          const ownLine = /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', comment.range[0] - 1) + 1, comment.range[0]));
          if (line && ownLine && comment.loc.start.line === chainEnd + 1) { chainEnd = comment.loc.end.line; continue; }
          if (!line && comment.value.startsWith('*') && published && DECLARATION.test(statementFor(comment)?.type ?? '')) continue;
          context.report({ loc: comment.loc, messageId: 'banned' });
        }
      },
    };
  },
};

export default { meta: { name: 'realtime' }, rules: { 'no-comments': noComments } };
